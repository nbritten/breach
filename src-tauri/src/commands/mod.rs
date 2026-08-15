pub mod agents;
pub mod gh;
pub mod notifications;
pub mod repos;
pub mod watcher;
pub mod shell;
pub mod sync;

use crate::git;
use std::ffi::OsStr;
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

/// Scan a directory for git repositories.
///
/// When `nested` is false (the default user-facing behavior), only immediate
/// child directories that are git repos are returned — the original "folder of
/// clones" layout.
///
/// When `nested` is true, walk the tree and return every working tree: the
/// configured root if it is itself a repo, parent repos, nested repos, and
/// linked worktrees (`.git` file). Git's internal `.git/worktrees/*` metadata
/// is never surfaced. `node_modules` is skipped so a recursive scan of a JS
/// tree doesn't crawl dependency copies.
///
/// Sorted by path for deterministic ordering. Empty Vec if the directory
/// doesn't exist — the dashboard's empty state is a better surface for "you
/// haven't configured a real path yet" than a red error toast.
pub async fn scan_git_repos(root: &Path, nested: bool) -> Result<Vec<PathBuf>, String> {
    if nested {
        scan_git_repos_nested(root).await
    } else {
        scan_git_repos_shallow(root).await
    }
}

async fn scan_git_repos_shallow(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut entries = match fs::read_dir(root).await {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("cannot read {}: {e}", root.display())),
    };

    let mut candidates = Vec::new();
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let path = entry.path();
        if let Ok(meta) = fs::metadata(&path).await {
            if meta.is_dir() && git::is_git_repo(&path) {
                candidates.push(path);
            }
        }
    }
    candidates.sort();
    Ok(candidates)
}

fn should_skip_nested_dir(name: &OsStr) -> bool {
    name == ".git" || name == "node_modules"
}

async fn scan_git_repos_nested(root: &Path) -> Result<Vec<PathBuf>, String> {
    // Probe the root the same way the shallow scan does so a missing path
    // stays an empty list rather than an error.
    match fs::read_dir(root).await {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("cannot read {}: {e}", root.display())),
    }

    let mut candidates = Vec::new();
    if git::is_git_repo(root) {
        candidates.push(root.to_path_buf());
    }

    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let mut entries = match fs::read_dir(&dir).await {
            Ok(e) => e,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => return Err(format!("cannot read {}: {e}", dir.display())),
        };
        while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
            if should_skip_nested_dir(&entry.file_name()) {
                continue;
            }
            let file_type = match entry.file_type().await {
                Ok(t) => t,
                Err(_) => continue,
            };
            if !file_type.is_dir() {
                continue;
            }
            let path = entry.path();
            if git::is_git_repo(&path) {
                candidates.push(path.clone());
            }
            // Keep walking inside repos so nested checkouts and worktrees
            // show up independently of their parent.
            stack.push(path);
        }
    }
    candidates.sort();
    Ok(candidates)
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

    #[tokio::test]
    async fn scan_returns_empty_for_missing_directory() {
        // A non-existent reposPath is the fresh-install default. The dashboard's
        // empty state is a better surface than a red error toast.
        let nowhere = PathBuf::from("/this/path/should/not/exist/by/any/chance");
        let result = scan_git_repos(&nowhere, false).await;
        assert_eq!(result, Ok(vec![]));
        let nested = scan_git_repos(&nowhere, true).await;
        assert_eq!(nested, Ok(vec![]));
    }

    fn unique_temp_dir() -> PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "breach-scan-{}-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn rel(root: &Path, path: &Path) -> PathBuf {
        path.strip_prefix(root).unwrap_or(path).to_path_buf()
    }

    /// Layout matching the feature's motivating example:
    ///
    /// ```text
    /// root/
    ///   project/.git/                  (parent repo)
    ///   project/frontend/.git/         (nested repo)
    ///   project/backend/.git/          (nested repo)
    ///   project/feature-worktree/.git  (linked worktree — .git is a file)
    ///   project/.git/worktrees/feature-worktree/  (Git metadata — not a repo)
    ///   notes/readme.txt               (non-repo sibling)
    /// ```
    fn seed_nested_layout(root: &Path) {
        std::fs::create_dir_all(root.join("project/.git/worktrees/feature-worktree")).unwrap();
        std::fs::create_dir_all(root.join("project/frontend/.git")).unwrap();
        std::fs::create_dir_all(root.join("project/backend/.git")).unwrap();
        std::fs::create_dir_all(root.join("project/feature-worktree")).unwrap();
        std::fs::write(
            root.join("project/feature-worktree/.git"),
            "gitdir: ../.git/worktrees/feature-worktree\n",
        )
        .unwrap();
        std::fs::create_dir_all(root.join("notes")).unwrap();
        std::fs::write(root.join("notes/readme.txt"), "hi").unwrap();
    }

    #[tokio::test]
    async fn scan_shallow_only_immediate_children() {
        let root = unique_temp_dir();
        seed_nested_layout(&root);
        let found = scan_git_repos(&root, false).await.unwrap();
        let rels: Vec<PathBuf> = found.iter().map(|p| rel(&root, p)).collect();
        assert_eq!(rels, vec![PathBuf::from("project")]);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn scan_nested_finds_parent_nested_and_worktree() {
        let root = unique_temp_dir();
        seed_nested_layout(&root);
        let found = scan_git_repos(&root, true).await.unwrap();
        let rels: Vec<PathBuf> = found.iter().map(|p| rel(&root, p)).collect();
        assert_eq!(
            rels,
            vec![
                PathBuf::from("project"),
                PathBuf::from("project/backend"),
                PathBuf::from("project/feature-worktree"),
                PathBuf::from("project/frontend"),
            ]
        );
        assert!(
            found
                .iter()
                .all(|p| !p.components().any(|c| c.as_os_str() == "worktrees")),
            "Git worktree metadata must not be surfaced as a repo"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn scan_nested_includes_root_when_it_is_a_repo() {
        let root = unique_temp_dir();
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::create_dir_all(root.join("frontend/.git")).unwrap();
        let found = scan_git_repos(&root, true).await.unwrap();
        assert!(found.iter().any(|p| p == &root));
        assert!(found.iter().any(|p| p == &root.join("frontend")));
        // Shallow scan still only looks at children, preserving prior behavior.
        let shallow = scan_git_repos(&root, false).await.unwrap();
        assert_eq!(shallow, vec![root.join("frontend")]);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn scan_nested_skips_node_modules() {
        let root = unique_temp_dir();
        std::fs::create_dir_all(root.join("app/.git")).unwrap();
        std::fs::create_dir_all(root.join("app/node_modules/leftpad/.git")).unwrap();
        let found = scan_git_repos(&root, true).await.unwrap();
        let rels: Vec<PathBuf> = found.iter().map(|p| rel(&root, p)).collect();
        assert_eq!(rels, vec![PathBuf::from("app")]);
        let _ = std::fs::remove_dir_all(&root);
    }
}
