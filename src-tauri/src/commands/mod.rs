pub mod agents;
pub mod gh;
pub mod notifications;
pub mod repos;
pub mod watcher;
pub mod shell;
pub mod sync;

use crate::git;
use std::collections::HashSet;
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
/// is never surfaced. Build and package directories (`node_modules`, `target`,
/// …) are not descended into (a checkout with those names is still listed),
/// and the walk stops at [`NESTED_SCAN_MAX_DEPTH`] so a mis-pointed scan of
/// `$HOME` cannot crawl forever.
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
    NESTED_SCAN_SKIP.iter().any(|n| name == *n)
}

/// Depth 0 is the configured repos path. Depth 8 covers
/// `~/dev/org/project/nested` with room to spare without walking a whole home
/// directory if someone points the setting at `$HOME`.
pub(crate) const NESTED_SCAN_MAX_DEPTH: usize = 8;

/// Directories that are never descended into during a nested scan.
/// `.git` is Git metadata (including `worktrees/`). The rest are package/build
/// trees that can dwarf the source. If one of those names *is* itself a
/// checkout, it is still listed — we just do not walk inside it.
const NESTED_SCAN_SKIP: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".output",
    ".venv",
    "venv",
    "vendor",
    "__pycache__",
    ".cache",
    "Pods",
    "coverage",
    ".turbo",
    ".parcel-cache",
    ".svelte-kit",
];

async fn scan_git_repos_nested(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut candidates = Vec::new();
    if git::is_git_repo(root) {
        candidates.push(root.to_path_buf());
    }

    let mut visited: HashSet<PathBuf> = HashSet::new();
    visited.insert(root.to_path_buf());
    if let Ok(canon) = fs::canonicalize(root).await {
        visited.insert(canon);
    }

    let mut stack = vec![(root.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        let is_root = dir.as_path() == root;
        let mut entries = match fs::read_dir(&dir).await {
            Ok(e) => e,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound && is_root => {
                return Ok(Vec::new());
            }
            Err(e) if is_root => {
                return Err(format!("cannot read {}: {e}", root.display()));
            }
            // A nested directory we can't read (permissions, dangling
            // symlink after metadata raced) must not wipe the whole scan.
            Err(_) => continue,
        };
        loop {
            let entry = match entries.next_entry().await {
                Ok(Some(e)) => e,
                Ok(None) => break,
                Err(_) => break,
            };
            let path = entry.path();
            let skip_descend = should_skip_nested_dir(&entry.file_name());
            // Follow symlinks, matching the shallow scan: a child that is a
            // symlink-to-dir with a `.git` entry is a repo, not a hole.
            let meta = match fs::metadata(&path).await {
                Ok(m) => m,
                Err(_) => continue,
            };
            if !meta.is_dir() {
                continue;
            }
            let child_depth = depth + 1;
            if child_depth > NESTED_SCAN_MAX_DEPTH {
                continue;
            }
            if git::is_git_repo(&path) {
                candidates.push(path.clone());
            }
            // Build/package trees may themselves be a checkout we should
            // show, but they are never descended into.
            if skip_descend || child_depth == NESTED_SCAN_MAX_DEPTH {
                continue;
            }
            // Keep walking inside repos so nested checkouts and worktrees
            // show up independently of their parent. Canonical paths stop
            // symlink cycles; the non-canonical path is recorded too so a
            // canonicalize failure cannot restack the same directory.
            if !visited.insert(path.clone()) {
                continue;
            }
            if let Ok(canon) = fs::canonicalize(&path).await {
                if !visited.insert(canon) {
                    continue;
                }
            }
            stack.push((path, child_depth));
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

    #[tokio::test]
    async fn scan_nested_skips_rust_target_dir() {
        let root = unique_temp_dir();
        std::fs::create_dir_all(root.join("app/.git")).unwrap();
        std::fs::create_dir_all(root.join("app/target/debug/.git")).unwrap();
        let found = scan_git_repos(&root, true).await.unwrap();
        let rels: Vec<PathBuf> = found.iter().map(|p| rel(&root, p)).collect();
        assert_eq!(rels, vec![PathBuf::from("app")]);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn scan_nested_lists_skip_named_dir_when_it_is_a_repo() {
        let root = unique_temp_dir();
        std::fs::create_dir_all(root.join("build/.git")).unwrap();
        std::fs::create_dir_all(root.join("build/nested/.git")).unwrap();
        std::fs::create_dir_all(root.join("app/.git")).unwrap();
        let found = scan_git_repos(&root, true).await.unwrap();
        let rels: Vec<PathBuf> = found.iter().map(|p| rel(&root, p)).collect();
        assert_eq!(
            rels,
            vec![PathBuf::from("app"), PathBuf::from("build")],
            "a checkout named build should appear, but we must not walk inside it"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn scan_nested_stops_at_max_depth() {
        let root = unique_temp_dir();
        let mut at_max = root.clone();
        for i in 1..=NESTED_SCAN_MAX_DEPTH {
            at_max.push(format!("d{i}"));
        }
        std::fs::create_dir_all(at_max.join(".git")).unwrap();
        let mut too_deep = at_max.clone();
        too_deep.push("d_too_deep");
        std::fs::create_dir_all(too_deep.join(".git")).unwrap();
        let found = scan_git_repos(&root, true).await.unwrap();
        assert!(
            found.iter().any(|p| p == &at_max),
            "repo at max depth should be listed"
        );
        assert!(
            found.iter().all(|p| p != &too_deep),
            "repo past max depth must not be listed: {found:?}"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn scan_nested_keeps_same_basename_checkouts_distinct() {
        let root = unique_temp_dir();
        std::fs::create_dir_all(root.join("acme/frontend/.git")).unwrap();
        std::fs::create_dir_all(root.join("beta/frontend/.git")).unwrap();
        let found = scan_git_repos(&root, true).await.unwrap();
        let rels: Vec<PathBuf> = found.iter().map(|p| rel(&root, p)).collect();
        assert_eq!(
            rels,
            vec![
                PathBuf::from("acme/frontend"),
                PathBuf::from("beta/frontend"),
            ]
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn scan_nested_follows_symlink_to_dir_as_repo() {
        let root = unique_temp_dir();
        std::fs::create_dir_all(root.join("actual/.git")).unwrap();
        std::os::unix::fs::symlink(root.join("actual"), root.join("link")).unwrap();
        let found = scan_git_repos(&root, true).await.unwrap();
        let rels: Vec<PathBuf> = found.iter().map(|p| rel(&root, p)).collect();
        assert!(
            rels.contains(&PathBuf::from("actual")),
            "real dir should be listed: {rels:?}"
        );
        assert!(
            rels.contains(&PathBuf::from("link")),
            "symlink-to-dir should be listed like the shallow scan: {rels:?}"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn scan_nested_symlink_loop_does_not_hang() {
        let root = unique_temp_dir();
        std::fs::create_dir_all(root.join("loop/.git")).unwrap();
        std::os::unix::fs::symlink(root.join("loop"), root.join("loop/back")).unwrap();
        let found = scan_git_repos(&root, true).await.unwrap();
        assert!(found.iter().any(|p| p == &root.join("loop")));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn scan_nested_skips_git_submodules() {
        let root = unique_temp_dir();
        std::fs::create_dir_all(root.join("project/.git/modules/vendor-lib")).unwrap();
        std::fs::create_dir_all(root.join("project/vendor-lib")).unwrap();
        std::fs::write(
            root.join("project/vendor-lib/.git"),
            "gitdir: ../.git/modules/vendor-lib\n",
        )
        .unwrap();
        let found = scan_git_repos(&root, true).await.unwrap();
        let rels: Vec<PathBuf> = found.iter().map(|p| rel(&root, p)).collect();
        assert_eq!(rels, vec![PathBuf::from("project")]);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn scan_nested_skips_unreadable_directory() {
        use std::os::unix::fs::PermissionsExt;
        let root = unique_temp_dir();
        std::fs::create_dir_all(root.join("visible/.git")).unwrap();
        let secret = root.join("secret");
        std::fs::create_dir_all(&secret).unwrap();
        let mut perms = std::fs::metadata(&secret).unwrap().permissions();
        perms.set_mode(0o000);
        std::fs::set_permissions(&secret, perms.clone()).unwrap();
        let found = scan_git_repos(&root, true).await;
        perms.set_mode(0o755);
        let _ = std::fs::set_permissions(&secret, perms);
        let rels: Vec<PathBuf> = found
            .expect("unreadable nested dir must not fail the scan")
            .iter()
            .map(|p| rel(&root, p))
            .collect();
        assert_eq!(rels, vec![PathBuf::from("visible")]);
        let _ = std::fs::remove_dir_all(&root);
    }
}
