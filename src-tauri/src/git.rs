use serde::Serialize;
use std::path::{Path, PathBuf};
use tokio::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct RepoSummary {
    pub name: String,
    pub path: String,
    pub branch: Option<String>,
    pub dirty: bool,
    pub ahead: u32,
    pub behind: u32,
    pub has_upstream: bool,
    pub last_commit: Option<CommitInfo>,
    pub error: Option<String>,
    /// `org/name` from `origin`, when the remote URL parses. Used to attach
    /// GitHub PRs to a checkout when two local folders share a basename.
    pub origin_slug: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct CommitInfo {
    pub sha: String,
    pub short_sha: String,
    pub subject: String,
    pub author: String,
    pub timestamp: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct DirtyFile {
    pub path: String,
    pub index_status: String,
    pub work_status: String,
}

pub async fn git(repo: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .await
        .map_err(|e| format!("git spawn failed: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// A directory counts as a git repo iff it has a `.git` entry: a directory in
/// normal clones, a gitdir-pointer file in linked worktrees.
/// Git submodules also use a `.git` file, but it points at `.git/modules/…`
/// inside the parent — those are not independent checkouts and must not
/// become dashboard cards or Sync targets.
///
/// We deliberately don't fall back to `git rev-parse --is-inside-work-tree` —
/// that spawned a process for every non-repo directory on every scan, and it
/// answers the wrong question anyway: it's true for any directory nested
/// inside some outer work tree, not just repo roots. Bare repos (no `.git`
/// entry) are intentionally not detected; the dashboard has nothing useful to
/// show for them.
///
/// Paths inside a `.git` directory (for example `.git/worktrees/<name>`) are
/// never repos — that's Git's internal worktree metadata, not a checkout.
pub fn is_git_repo(path: &Path) -> bool {
    if path_is_inside_git_dir(path) {
        return false;
    }
    let git_entry = path.join(".git");
    if git_entry.is_dir() {
        return true;
    }
    if git_entry.is_file() {
        return !git_file_points_at_submodule(&git_entry);
    }
    false
}

fn git_file_points_at_submodule(git_file: &Path) -> bool {
    let Ok(raw) = std::fs::read_to_string(git_file) else {
        return false;
    };
    gitdir_points_at_submodule(&raw)
}

/// True when a `.git` gitfile's `gitdir:` pointer targets the parent's
/// `.git/modules/` directory (a submodule), not a linked worktree.
pub(crate) fn gitdir_points_at_submodule(contents: &str) -> bool {
    let pointed = contents.trim();
    let pointed = pointed
        .strip_prefix("gitdir:")
        .map(str::trim)
        .unwrap_or(pointed);
    let normalized = pointed.replace('\\', "/");
    normalized.contains("/.git/modules/") || normalized.contains(".git/modules/")
}

/// True when `path` has a `.git` path component — i.e. it lives inside Git's
/// private metadata, not in a working tree.
pub fn path_is_inside_git_dir(path: &Path) -> bool {
    path.components().any(|c| c.as_os_str() == ".git")
}

pub async fn repo_summary(path: PathBuf) -> RepoSummary {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("?")
        .to_string();
    let path_str = path.to_string_lossy().to_string();

    let mut summary = RepoSummary {
        name,
        path: path_str,
        branch: None,
        dirty: false,
        ahead: 0,
        behind: 0,
        has_upstream: false,
        last_commit: None,
        error: None,
        origin_slug: None,
    };
    summary.origin_slug = origin_slug(&path).await;

    let status = match git(&path, &["status", "--porcelain=v2", "--branch"]).await {
        Ok(s) => s,
        Err(e) => {
            summary.error = Some(e);
            return summary;
        }
    };

    for line in status.lines() {
        if let Some(rest) = line.strip_prefix("# branch.head ") {
            summary.branch = Some(rest.trim().to_string());
        } else if let Some(rest) = line.strip_prefix("# branch.ab ") {
            summary.has_upstream = true;
            let (ahead, behind) = parse_branch_ab(rest);
            summary.ahead = ahead;
            summary.behind = behind;
        } else if !line.starts_with('#') && !line.is_empty() {
            summary.dirty = true;
        }
    }

    if let Ok(out) = git(
        &path,
        &[
            "log",
            "-1",
            "--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ct",
        ],
    )
    .await
    {
        let trimmed = out.trim();
        if !trimmed.is_empty() {
            let parts: Vec<&str> = trimmed.split('\x1f').collect();
            if parts.len() == 5 {
                summary.last_commit = Some(CommitInfo {
                    sha: parts[0].to_string(),
                    short_sha: parts[1].to_string(),
                    subject: parts[2].to_string(),
                    author: parts[3].to_string(),
                    timestamp: parts[4].parse().unwrap_or(0),
                });
            }
        }
    }

    summary
}

pub async fn working_diff(path: &Path) -> Result<String, String> {
    // Staged + unstaged combined view
    git(path, &["diff", "HEAD"]).await
}

pub async fn commit_diff(path: &Path, sha: &str) -> Result<String, String> {
    git(path, &["show", "--format=", sha]).await
}

/// Parse a single `git status --porcelain` line into a `DirtyFile`.
/// Returns `None` for lines that are too short to be valid status entries.
pub(crate) fn parse_porcelain_line(line: &str) -> Option<DirtyFile> {
    if line.len() < 4 {
        return None;
    }
    let bytes = line.as_bytes();
    Some(DirtyFile {
        index_status: (bytes[0] as char).to_string(),
        work_status: (bytes[1] as char).to_string(),
        path: line[3..].to_string(),
    })
}

pub async fn dirty_files(path: &Path) -> Result<Vec<DirtyFile>, String> {
    let out = git(path, &["status", "--porcelain"]).await?;
    Ok(out.lines().filter_map(parse_porcelain_line).collect())
}

pub async fn stash(path: &Path) -> Result<(), String> {
    git(path, &["stash", "push", "-u", "-m", "breach"]).await?;
    Ok(())
}

pub async fn discard_all(path: &Path) -> Result<(), String> {
    git(path, &["reset", "--hard", "HEAD"]).await?;
    git(path, &["clean", "-fd"]).await?;
    Ok(())
}

pub async fn is_dirty(path: &Path) -> Result<bool, String> {
    let out = git(path, &["status", "--porcelain"]).await?;
    Ok(!out.trim().is_empty())
}

pub async fn sync_to_default(path: &Path, branch: &str) -> Result<(), String> {
    if is_dirty(path).await? {
        return Err("Working tree is dirty — Clean first.".into());
    }
    git(path, &["fetch", "origin", branch]).await?;
    git(path, &["checkout", branch]).await?;
    let remote_ref = format!("origin/{branch}");
    git(path, &["merge", "--ff-only", &remote_ref]).await?;
    Ok(())
}

/// Parse the `# branch.ab +N -M` suffix from porcelain v2 status output into
/// `(ahead, behind)`. Returns `(0, 0)` for malformed input.
pub(crate) fn parse_branch_ab(rest: &str) -> (u32, u32) {
    let mut parts = rest.split_whitespace();
    let ahead = parts
        .next()
        .and_then(|s| s.trim_start_matches('+').parse().ok())
        .unwrap_or(0);
    let behind = parts
        .next()
        .and_then(|s| s.trim_start_matches('-').parse().ok())
        .unwrap_or(0);
    (ahead, behind)
}

/// Parse an `origin` remote URL into an `org/name` slug.
/// Accepts `git@host:org/name(.git)?` and `scheme://host/org/name(.git)?` forms.
pub fn parse_slug(url: &str) -> Option<String> {
    let core = url.trim().trim_end_matches(".git");
    if let Some(rest) = core.strip_prefix("git@") {
        return rest.split_once(':').map(|(_, slug)| slug.to_string());
    }
    if let Some(rest) = core.split("://").nth(1) {
        return rest.split_once('/').map(|(_, slug)| slug.to_string());
    }
    None
}

/// Get the `org/name` slug from the origin remote of a local repo.
pub async fn origin_slug(path: &Path) -> Option<String> {
    let out = git(path, &["remote", "get-url", "origin"]).await.ok()?;
    parse_slug(&out)
}

pub async fn recent_commits(path: &Path, limit: u32) -> Result<Vec<CommitInfo>, String> {
    let n = format!("-{}", limit);
    let out = git(
        path,
        &[
            "log",
            &n,
            "--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ct",
        ],
    )
    .await?;
    let mut commits = Vec::new();
    for line in out.lines() {
        let parts: Vec<&str> = line.split('\x1f').collect();
        if parts.len() == 5 {
            commits.push(CommitInfo {
                sha: parts[0].to_string(),
                short_sha: parts[1].to_string(),
                subject: parts[2].to_string(),
                author: parts[3].to_string(),
                timestamp: parts[4].parse().unwrap_or(0),
            });
        }
    }
    Ok(commits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_slug_ssh_with_suffix() {
        assert_eq!(
            parse_slug("git@github.com:applecart/matchmaker.git"),
            Some("applecart/matchmaker".into())
        );
    }

    #[test]
    fn parse_slug_ssh_without_suffix() {
        assert_eq!(
            parse_slug("git@github.com:applecart/matchmaker"),
            Some("applecart/matchmaker".into())
        );
    }

    #[test]
    fn parse_slug_https() {
        assert_eq!(
            parse_slug("https://github.com/applecart/matchmaker.git"),
            Some("applecart/matchmaker".into())
        );
    }

    #[test]
    fn parse_slug_trims_whitespace() {
        assert_eq!(
            parse_slug("  git@github.com:org/name.git\n"),
            Some("org/name".into())
        );
    }

    #[test]
    fn parse_slug_malformed() {
        assert_eq!(parse_slug(""), None);
        assert_eq!(parse_slug("not-a-url"), None);
        assert_eq!(parse_slug("git@github.com"), None);
    }

    #[test]
    fn parse_branch_ab_normal() {
        assert_eq!(parse_branch_ab("+3 -1"), (3, 1));
    }

    #[test]
    fn parse_branch_ab_zero() {
        assert_eq!(parse_branch_ab("+0 -0"), (0, 0));
    }

    #[test]
    fn parse_branch_ab_malformed() {
        assert_eq!(parse_branch_ab(""), (0, 0));
        assert_eq!(parse_branch_ab("+abc -def"), (0, 0));
        assert_eq!(parse_branch_ab("+5"), (5, 0));
    }

    #[test]
    fn parse_porcelain_modified_file() {
        let f = parse_porcelain_line(" M src/main.rs").unwrap();
        assert_eq!(f.index_status, " ");
        assert_eq!(f.work_status, "M");
        assert_eq!(f.path, "src/main.rs");
    }

    #[test]
    fn parse_porcelain_untracked() {
        let f = parse_porcelain_line("?? newfile.txt").unwrap();
        assert_eq!(f.index_status, "?");
        assert_eq!(f.work_status, "?");
        assert_eq!(f.path, "newfile.txt");
    }

    #[test]
    fn parse_porcelain_staged_and_modified() {
        let f = parse_porcelain_line("MM src/foo.rs").unwrap();
        assert_eq!(f.index_status, "M");
        assert_eq!(f.work_status, "M");
        assert_eq!(f.path, "src/foo.rs");
    }

    #[test]
    fn parse_porcelain_short_lines_rejected() {
        assert!(parse_porcelain_line("").is_none());
        assert!(parse_porcelain_line("M").is_none());
        assert!(parse_porcelain_line("MM ").is_none()); // needs XY + space + path
        assert!(parse_porcelain_line("MM a").is_some());
    }

    fn unique_temp_dir() -> PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "breach-git-{}-{}-{}",
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

    #[test]
    fn is_git_repo_detects_git_directory() {
        let dir = unique_temp_dir();
        std::fs::create_dir(dir.join(".git")).unwrap();
        assert!(is_git_repo(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn is_git_repo_detects_git_file_worktree() {
        let dir = unique_temp_dir();
        std::fs::write(dir.join(".git"), "gitdir: /tmp/repo/.git/worktrees/wt\n").unwrap();
        assert!(is_git_repo(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn is_git_repo_rejects_plain_directory() {
        let dir = unique_temp_dir();
        assert!(!is_git_repo(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn is_git_repo_rejects_internal_worktrees_metadata() {
        let dir = unique_temp_dir();
        let meta = dir.join(".git").join("worktrees").join("feature");
        std::fs::create_dir_all(&meta).unwrap();
        // Even if someone dropped a `.git` entry inside the metadata dir,
        // the path itself is Git-internal and must not count as a repo.
        std::fs::write(meta.join(".git"), "nope").unwrap();
        assert!(!is_git_repo(&meta));
        assert!(path_is_inside_git_dir(&meta));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn is_git_repo_rejects_submodule_gitfile() {
        let dir = unique_temp_dir();
        std::fs::write(dir.join(".git"), "gitdir: ../.git/modules/vendor-lib\n").unwrap();
        assert!(!is_git_repo(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn gitdir_points_at_submodule_detects_relative_and_absolute() {
        assert!(gitdir_points_at_submodule(
            "gitdir: ../.git/modules/vendor-lib\n"
        ));
        assert!(gitdir_points_at_submodule(
            "gitdir: /Users/me/proj/.git/modules/foo"
        ));
        assert!(!gitdir_points_at_submodule(
            "gitdir: /Users/me/proj/.git/worktrees/wt\n"
        ));
        assert!(!gitdir_points_at_submodule(
            "gitdir: /tmp/repo/.git/worktrees/wt"
        ));
    }
}
