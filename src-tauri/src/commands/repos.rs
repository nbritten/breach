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
