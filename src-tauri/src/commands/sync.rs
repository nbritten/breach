use crate::git;
use futures::stream::{self, StreamExt};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;

use super::{expand, scan_git_repos, MAX_PARALLEL};

#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum SyncStatus {
    Synced,
    SkippedDirty,
    Error,
}

#[derive(Serialize)]
pub struct SyncResult {
    pub name: String,
    pub path: String,
    pub status: SyncStatus,
    pub branch: String,
    pub error: Option<String>,
}

/// For each repo under `repos_path` (optionally filtered by `only_repos`), fast-forward its
/// default branch from origin. Dirty repos are skipped without attempting to sync. Branch
/// is resolved from `branch_overrides` (by repo name) or falls back to `default_branch`.
#[tauri::command]
pub async fn sync_all(
    repos_path: String,
    branch_overrides: HashMap<String, String>,
    default_branch: String,
    only_repos: Vec<String>,
) -> Result<Vec<SyncResult>, String> {
    let root = expand(&repos_path);
    let candidates = scan_git_repos(&root).await?;

    let only_set: std::collections::HashSet<String> = only_repos.into_iter().collect();
    let restrict = !only_set.is_empty();

    let filtered: Vec<PathBuf> = if restrict {
        candidates
            .into_iter()
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| only_set.contains(n))
                    .unwrap_or(false)
            })
            .collect()
    } else {
        candidates
    };

    let futures = filtered.into_iter().map(|p| {
        let overrides = branch_overrides.clone();
        let fallback = default_branch.clone();
        async move {
            let name = p
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("?")
                .to_string();
            let branch = overrides.get(&name).cloned().unwrap_or(fallback);
            let path_str = p.to_string_lossy().to_string();

            match git::is_dirty(&p).await {
                Ok(true) => {
                    return SyncResult {
                        name,
                        path: path_str,
                        status: SyncStatus::SkippedDirty,
                        branch,
                        error: None,
                    };
                }
                Err(e) => {
                    return SyncResult {
                        name,
                        path: path_str,
                        status: SyncStatus::Error,
                        branch,
                        error: Some(e),
                    };
                }
                Ok(false) => {}
            }

            match git::sync_to_default(&p, &branch).await {
                Ok(()) => SyncResult {
                    name,
                    path: path_str,
                    status: SyncStatus::Synced,
                    branch,
                    error: None,
                },
                Err(e) => SyncResult {
                    name,
                    path: path_str,
                    status: SyncStatus::Error,
                    branch,
                    error: Some(e),
                },
            }
        }
    });

    let results: Vec<SyncResult> = stream::iter(futures)
        .buffer_unordered(MAX_PARALLEL)
        .collect()
        .await;
    Ok(results)
}

/// Sync a single repo: fetch origin/<branch>, checkout <branch>, merge --ff-only. Fails
/// fast if the working tree is dirty.
#[tauri::command]
pub async fn repo_sync_to_default(repo_path: String, branch: String) -> Result<String, String> {
    let path = PathBuf::from(&repo_path);
    git::sync_to_default(&path, &branch).await?;
    Ok(branch)
}
