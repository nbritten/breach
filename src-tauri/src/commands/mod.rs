pub mod gh;
pub mod prune;
pub mod repos;
pub mod shell;
pub mod sync;

use crate::git;
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

#[cfg(test)]
mod tests {
    use super::*;

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
}

/// Scan a directory for immediate subdirectories that are git repositories.
/// Sorted by path for deterministic ordering. Empty Vec if the directory doesn't exist.
pub async fn scan_git_repos(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut entries = fs::read_dir(root)
        .await
        .map_err(|e| format!("cannot read {}: {e}", root.display()))?;

    let mut candidates = Vec::new();
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let path = entry.path();
        if let Ok(meta) = fs::metadata(&path).await {
            if meta.is_dir() && git::is_git_repo(&path).await {
                candidates.push(path);
            }
        }
    }
    candidates.sort();
    Ok(candidates)
}
