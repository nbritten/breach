use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify::{Config, RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer_opt, DebounceEventResult, Debouncer, NoCache};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

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

/// Find the repo this filesystem event belongs to: the immediate child directory
/// of `repos_root` that the event path lives under. Returns None if the path
/// isn't beneath the watched root or the event is on the root itself.
fn repo_for_event(event_path: &Path, repos_root: &Path) -> Option<PathBuf> {
    let rel = event_path.strip_prefix(repos_root).ok()?;
    let first = rel.components().next()?;
    Some(repos_root.join(first.as_os_str()))
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
                    if let Some(repo) = repo_for_event(path, &root_for_task) {
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
            repo_for_event(&event, &root),
            Some(PathBuf::from("/Users/me/repos/foo")),
        );
    }

    #[test]
    fn resolves_inside_dot_git() {
        let root = PathBuf::from("/Users/me/repos");
        let event = PathBuf::from("/Users/me/repos/foo/.git/HEAD");
        assert_eq!(
            repo_for_event(&event, &root),
            Some(PathBuf::from("/Users/me/repos/foo")),
        );
    }

    #[test]
    fn resolves_when_event_is_repo_dir_itself() {
        let root = PathBuf::from("/Users/me/repos");
        let event = PathBuf::from("/Users/me/repos/foo");
        assert_eq!(
            repo_for_event(&event, &root),
            Some(PathBuf::from("/Users/me/repos/foo")),
        );
    }

    #[test]
    fn returns_none_outside_root() {
        let root = PathBuf::from("/Users/me/repos");
        let event = PathBuf::from("/tmp/elsewhere");
        assert_eq!(repo_for_event(&event, &root), None);
    }

    #[test]
    fn returns_none_when_event_is_root_itself() {
        // Stripping the prefix of root from itself gives an empty relative
        // path, which has no first component — no specific repo to dispatch.
        let root = PathBuf::from("/Users/me/repos");
        assert_eq!(repo_for_event(&root, &root), None);
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
