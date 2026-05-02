use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use super::expand;

/// Tauri-managed handle for the active filesystem watcher. Holding it alive
/// keeps the watcher running; replacing it stops the previous one (the spawned
/// dispatch task ends on its own once its channel closes).
///
/// `RecommendedCache` differs by platform (FileIdMap on macOS, NoCache on
/// Linux), so we lean on the alias rather than hardcoding either.
type AppDebouncer = Debouncer<RecommendedWatcher, RecommendedCache>;

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
        return Err(format!("repos path does not exist: {}", root.display()));
    }

    // Drop the previous watcher first so we don't briefly hold two on the same
    // tree (and so a failure setting up the new one doesn't silently leave the
    // old one in place).
    {
        let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<DebounceEventResult>();
    let mut debouncer = new_debouncer(
        Duration::from_millis(DEBOUNCE_MS),
        None,
        move |result: DebounceEventResult| {
            // Send-failures only happen if the receiver was dropped, which
            // means we're being torn down — nothing useful to do.
            let _ = tx.send(result);
        },
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
                    if let Some(repo) = repo_for_event(path, &root_for_task) {
                        affected.insert(repo);
                    }
                }
            }
            for repo in affected {
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
}
