use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify::{Config, RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer_opt, DebounceEventResult, Debouncer, NoCache};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::git;

use super::expand;

/// Tauri-managed handle for the active filesystem watcher. Holding it alive
/// keeps the watcher running; replacing it stops the previous one (the spawned
/// dispatch task ends on its own once its channel closes).
///
/// We opt out of the debouncer's file-id cache (`NoCache`) on every platform.
/// The default `RecommendedCache` is a `FileIdMap` on macOS that does
/// O(cache_size) work in `remove_path` on every delete event, which pegs the
/// CPU when the watched tree contains a directory with high churn (node_modules
/// rebuilds, IDE indexers, .git pack compaction). We only emit per-repo
/// "something changed" events, so the cache's rename-detection isn't worth it.
type AppDebouncer = Debouncer<RecommendedWatcher, NoCache>;

#[derive(Default)]
pub struct WatcherState {
    inner: Mutex<Option<AppDebouncer>>,
}

#[derive(Serialize, Clone)]
struct RepoChanged {
    path: String,
}

const REPO_CHANGED_EVENT: &str = "repo-changed";

/// Debounce window for filesystem events. Long enough to coalesce a `git pull`
/// burst into one repo-changed dispatch, short enough that the dashboard
/// reflects an interactive edit within a couple frames.
const DEBOUNCE_MS: u64 = 250;

/// Find the repo this filesystem event belongs to.
///
/// Shallow mode (the default): the immediate child directory of `repos_root`
/// that the event path lives under. Returns None if the path isn't beneath
/// the watched root or the event is on the root itself.
///
/// Nested mode: the closest ancestor that is a git working tree, so a change
/// inside `project/frontend` refreshes that nested repo rather than the
/// parent. Events under `.git/worktrees/<id>/` resolve through Git's `gitdir`
/// pointer to the linked checkout, not the parent repo that owns the metadata.
fn repo_for_event(event_path: &Path, repos_root: &Path, nested: bool) -> Option<PathBuf> {
    if nested {
        if let Some(checkout) = worktree_checkout_for_event(event_path, repos_root) {
            return Some(checkout);
        }
        closest_repo(event_path, repos_root, git::is_git_repo)
    } else {
        let rel = event_path.strip_prefix(repos_root).ok()?;
        let first = rel.components().next()?;
        Some(repos_root.join(first.as_os_str()))
    }
}

/// Git stores a linked worktree's HEAD/index under
/// `<repo>/.git/worktrees/<id>/`. The `gitdir` file in that folder points at
/// the checkout's `.git` file (typically `…/feature-worktree/.git`). Reading
/// it is how we attribute a gitdir-only event to the card for that checkout.
fn worktree_gitdir_file(event_path: &Path) -> Option<PathBuf> {
    let comps: Vec<_> = event_path.components().collect();
    for i in 0..comps.len().saturating_sub(2) {
        if comps[i].as_os_str() == ".git" && comps[i + 1].as_os_str() == "worktrees" {
            let mut meta = PathBuf::new();
            for c in comps.iter().take(i + 3) {
                meta.push(c);
            }
            return Some(meta.join("gitdir"));
        }
    }
    None
}

fn checkout_from_worktree_gitdir(gitdir_file: &Path) -> Option<PathBuf> {
    let raw = std::fs::read_to_string(gitdir_file).ok()?;
    let pointed = raw.trim();
    let pointed = pointed
        .strip_prefix("gitdir:")
        .map(str::trim)
        .unwrap_or(pointed);
    if pointed.is_empty() {
        return None;
    }
    let mut git_file = PathBuf::from(pointed);
    if git_file.is_relative() {
        git_file = gitdir_file.parent()?.join(git_file);
    }
    git_file.parent().map(PathBuf::from)
}

fn worktree_checkout_for_event(event_path: &Path, repos_root: &Path) -> Option<PathBuf> {
    let gitdir_file = worktree_gitdir_file(event_path)?;
    let checkout = checkout_from_worktree_gitdir(&gitdir_file)?;
    if checkout == repos_root || checkout.strip_prefix(repos_root).is_ok() {
        Some(checkout)
    } else {
        None
    }
}

/// Walk from `event_path` up to `repos_root` (inclusive) and return the
/// closest path for which `is_repo` is true, skipping anything inside a
/// `.git` directory.
fn closest_repo(
    event_path: &Path,
    repos_root: &Path,
    is_repo: impl Fn(&Path) -> bool,
) -> Option<PathBuf> {
    if event_path != repos_root && event_path.strip_prefix(repos_root).is_err() {
        return None;
    }
    let mut current = event_path;
    loop {
        if !git::path_is_inside_git_dir(current) && is_repo(current) {
            return Some(current.to_path_buf());
        }
        if current == repos_root {
            return None;
        }
        current = current.parent()?;
    }
}

/// Should this event path be dropped instead of dispatched?
///
/// The frontend reacts to `repo-changed` by running `git status`, and
/// `git status --porcelain=v2` is not a passive reader: it takes
/// `.git/index.lock` (and usually rewrites `.git/index` via the opportunistic
/// index refresh). Those writes land right back in this watcher, which would
/// emit another `repo-changed`, trigger another status, and echo forever —
/// one dashboard refresh per debounce window, per repo, indefinitely. Breaking
/// the loop means dropping the event categories that git's own bookkeeping
/// generates:
///
/// - `*.lock` files inside `.git` (`index.lock`, `HEAD.lock`, ref locks under
///   `.git/refs/`): pure transient scaffolding — every git write creates and
///   deletes one, and the interesting write shows up as its own event anyway.
/// - `.git/objects/`: object and pack churn (`git gc`, fetch unpacking, pack
///   compaction) that says nothing about the checked-out state.
/// - `.git/FETCH_HEAD`: rewritten by every fetch even when nothing changed.
///
/// Everything else in `.git` stays interesting: `HEAD` (branch switch),
/// `index` (staging — and while status's refresh can rewrite it, that rewrite
/// only happens when stat info was stale, so it settles after one extra round
/// rather than looping), and `.git/refs/**` (commits, resets, fetches that
/// actually moved a branch). Working-tree paths — including a `Cargo.lock` at
/// the repo top level — are never noise.
fn is_noise(path: &Path) -> bool {
    let mut after_git = path
        .components()
        .map(|c| c.as_os_str())
        .skip_while(|c| *c != ".git");
    if after_git.next().is_none() {
        // No `.git` component: a working-tree change, always interesting.
        return false;
    }
    let Some(first) = after_git.next() else {
        // The event is on the `.git` directory itself (e.g. a fresh clone
        // appearing). Keep it — it's how a new repo announces itself.
        return false;
    };
    if first == "objects" || first == "FETCH_HEAD" {
        return true;
    }
    path.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.ends_with(".lock"))
}

/// Start watching `repos_path` recursively for filesystem changes. Events are
/// debounced over a short window, grouped per repo, and surfaced to the
/// frontend via the `repo-changed` Tauri event so it can re-fetch just the
/// repo that moved. Calling again replaces the previous watcher.
#[tauri::command]
pub fn start_repos_watcher(
    repos_path: String,
    scan_nested: bool,
    state: State<'_, WatcherState>,
    app: AppHandle,
) -> Result<(), String> {
    let root = expand(&repos_path);
    if !root.exists() {
        // Soft-fail: a non-existent repos path is normal on a fresh install
        // before the user has configured anything real. The dashboard's empty
        // state already communicates that nothing's being watched; an Err
        // here would surface as a red toast on every launch.
        return Ok(());
    }

    // Drop the previous watcher first so we don't briefly hold two on the same
    // tree (and so a failure setting up the new one doesn't silently leave the
    // old one in place).
    {
        let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<DebounceEventResult>();
    let mut debouncer = new_debouncer_opt::<_, RecommendedWatcher, NoCache>(
        Duration::from_millis(DEBOUNCE_MS),
        None,
        move |result: DebounceEventResult| {
            // Send-failures only happen if the receiver was dropped, which
            // means we're being torn down — nothing useful to do.
            let _ = tx.send(result);
        },
        NoCache::new(),
        Config::default(),
    )
    .map_err(|e| format!("create watcher: {e}"))?;

    debouncer
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| format!("watch {}: {e}", root.display()))?;

    {
        let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
        *guard = Some(debouncer);
    }

    let root_for_task = root.clone();
    // The dispatch loop ends when `rx.recv()` returns None, which only happens
    // once every `tx` clone has been dropped. The debouncer is the sole owner
    // of `tx`, so dropping it (on the next start_repos_watcher call, or on app
    // shutdown) is what tears this task down. Don't add other tx clones unless
    // you're prepared to manage them.
    //
    // We use `tauri::async_runtime::spawn` rather than bare `tokio::spawn`
    // because this command is sync (`fn`, not `async fn`) and runs on the IPC
    // thread, which doesn't have a Tokio runtime context attached — `tokio::spawn`
    // would panic with "no reactor running" and abort the process. Tauri's helper
    // explicitly hops onto its managed runtime.
    tauri::async_runtime::spawn(async move {
        while let Some(result) = rx.recv().await {
            // notify can surface filesystem errors here (e.g. transient permission
            // hiccups); a single bad batch shouldn't kill the whole watch loop.
            // We log so a runaway dead-watcher is at least diagnosable in the
            // dev-tools console rather than silently freezing live updates.
            let events = match result {
                Ok(events) => events,
                Err(errs) => {
                    eprintln!("repos watcher: dropped batch ({} errors)", errs.len());
                    continue;
                }
            };
            let mut affected: HashSet<PathBuf> = HashSet::new();
            for event in events {
                for path in &event.event.paths {
                    if is_noise(path) {
                        continue;
                    }
                    if let Some(repo) = repo_for_event(path, &root_for_task, scan_nested) {
                        affected.insert(repo);
                    }
                }
            }
            for repo in affected {
                // Drop events for paths that exist but are not directories. A
                // plain file sitting directly in the repos root (Finder's
                // .DS_Store is the classic — it rewrites that file constantly)
                // resolves to a "repo" path the frontend has never heard of,
                // and an unknown path makes it fall back to a full dashboard
                // refresh. A path that no longer exists is different: that's a
                // repo being deleted, and the frontend needs the event to
                // re-list and drop the stale card. This check lives here
                // rather than in repo_for_event so that function stays pure
                // and its tests stay filesystem-free.
                if repo.exists() && !repo.is_dir() {
                    continue;
                }
                let _ = app.emit(
                    REPO_CHANGED_EVENT,
                    RepoChanged {
                        path: repo.to_string_lossy().to_string(),
                    },
                );
            }
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_to_first_child_directory() {
        let root = PathBuf::from("/Users/me/repos");
        let event = PathBuf::from("/Users/me/repos/foo/src/main.rs");
        assert_eq!(
            repo_for_event(&event, &root, false),
            Some(PathBuf::from("/Users/me/repos/foo")),
        );
    }

    #[test]
    fn resolves_inside_dot_git() {
        let root = PathBuf::from("/Users/me/repos");
        let event = PathBuf::from("/Users/me/repos/foo/.git/HEAD");
        assert_eq!(
            repo_for_event(&event, &root, false),
            Some(PathBuf::from("/Users/me/repos/foo")),
        );
    }

    #[test]
    fn resolves_when_event_is_repo_dir_itself() {
        let root = PathBuf::from("/Users/me/repos");
        let event = PathBuf::from("/Users/me/repos/foo");
        assert_eq!(
            repo_for_event(&event, &root, false),
            Some(PathBuf::from("/Users/me/repos/foo")),
        );
    }

    #[test]
    fn returns_none_outside_root() {
        let root = PathBuf::from("/Users/me/repos");
        let event = PathBuf::from("/tmp/elsewhere");
        assert_eq!(repo_for_event(&event, &root, false), None);
    }

    #[test]
    fn returns_none_when_event_is_root_itself() {
        // Stripping the prefix of root from itself gives an empty relative
        // path, which has no first component — no specific repo to dispatch.
        let root = PathBuf::from("/Users/me/repos");
        assert_eq!(repo_for_event(&root, &root, false), None);
    }

    fn nested_is_repo(path: &Path) -> bool {
        // Simulate the user's layout without touching the filesystem:
        // /Users/me/dev/project, .../frontend, .../backend, .../feature-worktree
        matches!(
            path.to_str(),
            Some(
                "/Users/me/dev/project"
                    | "/Users/me/dev/project/frontend"
                    | "/Users/me/dev/project/backend"
                    | "/Users/me/dev/project/feature-worktree"
            )
        )
    }

    #[test]
    fn nested_resolves_to_innermost_repo() {
        let root = PathBuf::from("/Users/me/dev");
        let event = PathBuf::from("/Users/me/dev/project/frontend/src/App.tsx");
        assert_eq!(
            closest_repo(&event, &root, nested_is_repo),
            Some(PathBuf::from("/Users/me/dev/project/frontend")),
        );
    }

    #[test]
    fn nested_resolves_parent_when_change_is_in_parent() {
        let root = PathBuf::from("/Users/me/dev");
        let event = PathBuf::from("/Users/me/dev/project/README.md");
        assert_eq!(
            closest_repo(&event, &root, nested_is_repo),
            Some(PathBuf::from("/Users/me/dev/project")),
        );
    }

    #[test]
    fn nested_resolves_worktree_checkout() {
        let root = PathBuf::from("/Users/me/dev");
        let event = PathBuf::from("/Users/me/dev/project/feature-worktree/src/lib.rs");
        assert_eq!(
            closest_repo(&event, &root, nested_is_repo),
            Some(PathBuf::from("/Users/me/dev/project/feature-worktree")),
        );
    }

    #[test]
    fn nested_does_not_resolve_internal_worktrees_metadata() {
        let root = PathBuf::from("/Users/me/dev");
        let event = PathBuf::from("/Users/me/dev/project/.git/worktrees/feature-worktree/HEAD");
        // Without a gitdir pointer, walk past the metadata dir to the parent
        // checkout rather than treating the metadata folder as a repo.
        assert_eq!(
            closest_repo(&event, &root, nested_is_repo),
            Some(PathBuf::from("/Users/me/dev/project")),
        );
    }

    #[test]
    fn worktree_gitdir_file_from_head_event() {
        let event = PathBuf::from("/Users/me/dev/project/.git/worktrees/feature-worktree/HEAD");
        assert_eq!(
            worktree_gitdir_file(&event),
            Some(PathBuf::from(
                "/Users/me/dev/project/.git/worktrees/feature-worktree/gitdir"
            )),
        );
    }

    #[test]
    fn worktree_gitdir_file_ignores_ordinary_git_paths() {
        assert_eq!(
            worktree_gitdir_file(Path::new("/Users/me/dev/project/.git/HEAD")),
            None,
        );
        assert_eq!(
            worktree_gitdir_file(Path::new("/Users/me/dev/project/src/main.rs")),
            None,
        );
    }

    #[test]
    fn checkout_from_gitdir_file_absolute() {
        let dir = std::env::temp_dir().join(format!(
            "breach-wt-gitdir-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let gitdir = dir.join("gitdir");
        std::fs::write(&gitdir, "/Users/me/dev/project/feature-worktree/.git\n").unwrap();
        assert_eq!(
            checkout_from_worktree_gitdir(&gitdir),
            Some(PathBuf::from("/Users/me/dev/project/feature-worktree")),
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn nested_worktree_metadata_event_resolves_to_checkout() {
        let root = std::env::temp_dir().join(format!(
            "breach-wt-event-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        let checkout = root.join("project/feature-worktree");
        let meta = root.join("project/.git/worktrees/feature-worktree");
        std::fs::create_dir_all(&checkout).unwrap();
        std::fs::create_dir_all(&meta).unwrap();
        std::fs::write(checkout.join(".git"), format!("gitdir: {}\n", meta.display())).unwrap();
        std::fs::write(meta.join("gitdir"), format!("{}\n", checkout.join(".git").display()))
            .unwrap();
        let event = meta.join("HEAD");
        assert_eq!(
            repo_for_event(&event, &root, true),
            Some(checkout),
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn nested_returns_none_outside_root() {
        let root = PathBuf::from("/Users/me/dev");
        let event = PathBuf::from("/tmp/elsewhere");
        assert_eq!(closest_repo(&event, &root, nested_is_repo), None);
    }

    #[test]
    fn nested_includes_root_when_root_is_a_repo() {
        let root = PathBuf::from("/Users/me/dev/project");
        let event = PathBuf::from("/Users/me/dev/project/README.md");
        assert_eq!(
            closest_repo(&event, &root, nested_is_repo),
            Some(PathBuf::from("/Users/me/dev/project")),
        );
    }

    #[test]
    fn noise_index_lock() {
        assert!(is_noise(Path::new("/Users/me/repos/foo/.git/index.lock")));
    }

    #[test]
    fn noise_head_lock() {
        assert!(is_noise(Path::new("/Users/me/repos/foo/.git/HEAD.lock")));
    }

    #[test]
    fn noise_ref_lock() {
        assert!(is_noise(Path::new(
            "/Users/me/repos/foo/.git/refs/heads/main.lock"
        )));
    }

    #[test]
    fn noise_objects() {
        assert!(is_noise(Path::new(
            "/Users/me/repos/foo/.git/objects/ab/cdef0123456789"
        )));
        assert!(is_noise(Path::new(
            "/Users/me/repos/foo/.git/objects/pack/pack-abc123.pack"
        )));
    }

    #[test]
    fn noise_fetch_head() {
        assert!(is_noise(Path::new("/Users/me/repos/foo/.git/FETCH_HEAD")));
    }

    #[test]
    fn keeps_head_index_and_refs() {
        // These are the events that signal real state changes: branch
        // switches, staging, and commits/fetches that moved a ref.
        assert!(!is_noise(Path::new("/Users/me/repos/foo/.git/HEAD")));
        assert!(!is_noise(Path::new("/Users/me/repos/foo/.git/index")));
        assert!(!is_noise(Path::new(
            "/Users/me/repos/foo/.git/refs/heads/main"
        )));
        assert!(!is_noise(Path::new(
            "/Users/me/repos/foo/.git/refs/remotes/origin/main"
        )));
    }

    #[test]
    fn keeps_working_tree_paths() {
        assert!(!is_noise(Path::new("/Users/me/repos/foo/src/main.rs")));
        // Lock-suffixed files outside .git are real project files.
        assert!(!is_noise(Path::new("/Users/me/repos/foo/Cargo.lock")));
        assert!(!is_noise(Path::new("/Users/me/repos/foo/yarn.lock")));
    }

    #[test]
    fn keeps_dot_git_dir_itself() {
        // A fresh clone appearing shows up as an event on .git itself.
        assert!(!is_noise(Path::new("/Users/me/repos/foo/.git")));
    }
}
