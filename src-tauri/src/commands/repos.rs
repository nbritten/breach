use crate::git::{self, CommitInfo, DirtyFile, RepoSummary};
use futures::stream::{self, StreamExt};
use std::path::PathBuf;

use super::{expand, scan_git_repos, MAX_PARALLEL};

/// Scan the repos directory for git repos and return a summary for each (branch, dirty,
/// ahead/behind, last commit). Sorted alphabetically by name.
#[tauri::command]
pub async fn list_repos(repos_path: String) -> Result<Vec<RepoSummary>, String> {
    let root = expand(&repos_path);
    let candidates = scan_git_repos(&root).await?;

    let mut summaries: Vec<RepoSummary> = stream::iter(candidates.into_iter().map(git::repo_summary))
        .buffer_unordered(MAX_PARALLEL)
        .collect()
        .await;
    summaries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(summaries)
}

/// Re-scan a single repo and return its fresh summary. Used for per-card refresh.
#[tauri::command]
pub async fn repo_summary(repo_path: String) -> RepoSummary {
    git::repo_summary(PathBuf::from(repo_path)).await
}

/// Return the working-tree diff vs HEAD (staged + unstaged combined).
#[tauri::command]
pub async fn repo_diff(repo_path: String) -> Result<String, String> {
    git::working_diff(&PathBuf::from(repo_path)).await
}

/// Return the `limit` most recent commits (default 30) as structured info.
#[tauri::command]
pub async fn repo_log(repo_path: String, limit: Option<u32>) -> Result<Vec<CommitInfo>, String> {
    git::recent_commits(&PathBuf::from(repo_path), limit.unwrap_or(30)).await
}

/// Return the diff introduced by a specific commit.
#[tauri::command]
pub async fn commit_diff(repo_path: String, sha: String) -> Result<String, String> {
    git::commit_diff(&PathBuf::from(repo_path), &sha).await
}

/// List every modified/untracked file in a repo with its porcelain XY status.
#[tauri::command]
pub async fn repo_dirty_files(repo_path: String) -> Result<Vec<DirtyFile>, String> {
    git::dirty_files(&PathBuf::from(repo_path)).await
}

/// `git stash push -u -m "breach"` — preserves dirty state including untracked files.
#[tauri::command]
pub async fn repo_stash(repo_path: String) -> Result<(), String> {
    git::stash(&PathBuf::from(repo_path)).await
}

/// `git reset --hard HEAD && git clean -fd` — destroys all uncommitted changes.
/// Caller is responsible for confirming intent (e.g., typed-name modal).
#[tauri::command]
pub async fn repo_discard_all(repo_path: String) -> Result<(), String> {
    git::discard_all(&PathBuf::from(repo_path)).await
}

/// The default repos path (`$HOME/repos`) used when Settings hasn't been configured yet.
#[tauri::command]
pub fn default_repos_path() -> String {
    dirs::home_dir()
        .map(|h| h.join("repos").to_string_lossy().to_string())
        .unwrap_or_else(|| "~/repos".to_string())
}

/// Inverse of `expand`: replace the leading home directory with `~` so an exported
/// settings file is portable to another machine where `$HOME` differs.
#[tauri::command]
pub fn home_relative(path: String) -> String {
    home_relative_with_home(&path, dirs::home_dir())
}

pub(crate) fn home_relative_with_home(path: &str, home: Option<PathBuf>) -> String {
    let Some(home) = home else { return path.to_string() };
    let Some(home_str) = home.to_str() else { return path.to_string() };
    if path == home_str {
        return "~".to_string();
    }
    if let Some(rest) = path.strip_prefix(&format!("{home_str}/")) {
        return format!("~/{rest}");
    }
    path.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn home() -> PathBuf {
        PathBuf::from("/Users/tester")
    }

    #[test]
    fn home_relative_bare_home() {
        assert_eq!(home_relative_with_home("/Users/tester", Some(home())), "~");
    }

    #[test]
    fn home_relative_with_subpath() {
        assert_eq!(
            home_relative_with_home("/Users/tester/repos", Some(home())),
            "~/repos",
        );
    }

    #[test]
    fn home_relative_nested_subpath() {
        assert_eq!(
            home_relative_with_home("/Users/tester/Code/breach", Some(home())),
            "~/Code/breach",
        );
    }

    #[test]
    fn home_relative_unrelated_path_unchanged() {
        assert_eq!(
            home_relative_with_home("/etc/hosts", Some(home())),
            "/etc/hosts",
        );
    }

    #[test]
    fn home_relative_without_home_unchanged() {
        assert_eq!(
            home_relative_with_home("/Users/tester/repos", None),
            "/Users/tester/repos",
        );
    }

    #[test]
    fn home_relative_sibling_user_path_unchanged() {
        // /Users/testers must NOT match the /Users/tester home — only an exact
        // match or a `$HOME/` prefix should reduce.
        assert_eq!(
            home_relative_with_home("/Users/testers/x", Some(home())),
            "/Users/testers/x",
        );
    }
}
