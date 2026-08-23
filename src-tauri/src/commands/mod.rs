pub mod agents;
pub mod gh;
pub mod notifications;
pub mod repos;
pub mod watcher;
pub mod shell;
pub mod sync;

use futures::stream::{self, StreamExt};
use std::path::{Path, PathBuf};
use tokio::fs;

/// Balance of throughput and file-descriptor headroom on macOS (soft NOFILE is bumped to 65k
/// at startup, but a lower per-op cap also protects against pathological `gh` / `git` fan-out).
pub const MAX_PARALLEL: usize = 24;

/// Expand a leading `~` to `home`, returning the path as-is otherwise.
pub(crate) fn expand_with_home(path: &str, home: Option<PathBuf>) -> PathBuf {
    match (home, path) {
        (Some(h), "~") => h,
        (Some(h), p) if p.starts_with("~/") => h.join(&p[2..]),
        _ => PathBuf::from(path),
    }
}

/// Expand a leading `~` to the user's home directory. Returns the input as-is if the home
/// directory can't be resolved (very unusual).
pub fn expand(path: &str) -> PathBuf {
    expand_with_home(path, dirs::home_dir())
}

/// Scan a directory for immediate subdirectories that are git repositories.
/// Sorted by path for deterministic ordering. Empty Vec if the directory doesn't
/// exist — the dashboard's empty state is a better surface for "you haven't
/// configured a real path yet" than a red error toast.
pub async fn scan_git_repos(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut entries = match fs::read_dir(root).await {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("cannot read {}: {e}", root.display())),
    };

    let mut paths = Vec::new();
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        paths.push(entry.path());
    }
    let checks = paths.into_iter().map(|path| async move {
        let is_dir = fs::metadata(&path)
            .await
            .map(|meta| meta.is_dir())
            .unwrap_or(false);
        let has_git = is_dir && fs::metadata(path.join(".git")).await.is_ok();
        has_git.then_some(path)
    });
    let checked: Vec<Option<PathBuf>> = stream::iter(checks)
        .buffer_unordered(MAX_PARALLEL)
        .collect()
        .await;
    let mut candidates: Vec<PathBuf> = checked.into_iter().flatten().collect();
    candidates.sort();
    Ok(candidates)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn home() -> PathBuf {
        PathBuf::from("/Users/tester")
    }

    #[test]
    fn expand_bare_tilde() {
        assert_eq!(expand_with_home("~", Some(home())), home());
    }

    #[test]
    fn expand_tilde_slash() {
        assert_eq!(
            expand_with_home("~/repos", Some(home())),
            home().join("repos")
        );
    }

    #[test]
    fn expand_nested_tilde() {
        assert_eq!(
            expand_with_home("~/Code/breach", Some(home())),
            home().join("Code/breach")
        );
    }

    #[test]
    fn expand_absolute_path_unchanged() {
        assert_eq!(
            expand_with_home("/etc/hosts", Some(home())),
            PathBuf::from("/etc/hosts")
        );
    }

    #[test]
    fn expand_relative_path_unchanged() {
        assert_eq!(
            expand_with_home("some/dir", Some(home())),
            PathBuf::from("some/dir")
        );
    }

    #[test]
    fn expand_without_home_preserves_tilde() {
        // If dirs::home_dir() fails, tilde stays literal rather than producing a weird result.
        assert_eq!(expand_with_home("~/repos", None), PathBuf::from("~/repos"));
    }

    #[test]
    fn expand_tildeuser_not_expanded() {
        // We only handle `~` and `~/…`, not `~someone/path`.
        assert_eq!(
            expand_with_home("~alice/thing", Some(home())),
            PathBuf::from("~alice/thing")
        );
    }

    #[tokio::test]
    async fn scan_returns_empty_for_missing_directory() {
        // A non-existent reposPath is the fresh-install default. The dashboard's
        // empty state is a better surface than a red error toast.
        let nowhere = PathBuf::from("/this/path/should/not/exist/by/any/chance");
        let result = scan_git_repos(&nowhere).await;
        assert_eq!(result, Ok(vec![]));
    }

    #[tokio::test]
    async fn scan_finds_repos_without_spawning_git() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root =
            std::env::temp_dir().join(format!("breach-scan-test-{}-{unique}", std::process::id()));
        let repo = root.join("repo");
        let worktree = root.join("worktree");
        fs::create_dir_all(repo.join(".git")).await.unwrap();
        fs::create_dir_all(&worktree).await.unwrap();
        fs::write(worktree.join(".git"), "gitdir: ../repo/.git/worktrees/test")
            .await
            .unwrap();
        fs::create_dir_all(root.join("ordinary-dir")).await.unwrap();

        let found = scan_git_repos(&root).await.unwrap();
        assert_eq!(found, vec![repo, worktree]);

        fs::remove_dir_all(root).await.unwrap();
    }
}
