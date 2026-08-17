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
/// is resolved from `branch_overrides` (by full path, then by repo name when that
/// name is unique among the repos being synced) or falls back to `default_branch`.
/// `scan_nested` is forwarded to the same scan `list_repos` uses so Sync visits
/// every repo the dashboard is showing.
#[tauri::command]
pub async fn sync_all(
    repos_path: String,
    branch_overrides: HashMap<String, String>,
    default_branch: String,
    only_repos: Vec<String>,
    scan_nested: bool,
) -> Result<Vec<SyncResult>, String> {
    let root = expand(&repos_path);
    let candidates = scan_git_repos(&root, scan_nested).await?;

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
                    || only_set.contains(&p.to_string_lossy().to_string())
            })
            .collect()
    } else {
        candidates
    };

    let mut name_counts: HashMap<String, usize> = HashMap::new();
    for p in &filtered {
        if let Some(n) = p.file_name().and_then(|n| n.to_str()) {
            *name_counts.entry(n.to_string()).or_default() += 1;
        }
    }

    let futures = filtered.into_iter().map(|p| {
        let overrides = branch_overrides.clone();
        let fallback = default_branch.clone();
        let name_unique = p
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| name_counts.get(n).copied().unwrap_or(0) <= 1)
            .unwrap_or(false);
        async move {
            let name = p
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("?")
                .to_string();
            let path_str = p.to_string_lossy().to_string();
            let branch = resolve_sync_branch(&name, &path_str, &overrides, &fallback, name_unique);

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

/// Path override always wins. A basename override applies only when that
/// name is unique among the repos being synced, so two `frontend` checkouts
/// do not share one `develop` override.
pub(crate) fn resolve_sync_branch(
    name: &str,
    path: &str,
    overrides: &HashMap<String, String>,
    fallback: &str,
    name_unique: bool,
) -> String {
    if let Some(branch) = overrides.get(path) {
        return branch.clone();
    }
    if name_unique {
        if let Some(branch) = overrides.get(name) {
            return branch.clone();
        }
    }
    fallback.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn overrides() -> HashMap<String, String> {
        HashMap::from([
            ("frontend".into(), "develop".into()),
            ("/dev/acme/frontend".into(), "release".into()),
        ])
    }

    #[test]
    fn path_override_wins() {
        assert_eq!(
            resolve_sync_branch(
                "frontend",
                "/dev/acme/frontend",
                &overrides(),
                "main",
                false,
            ),
            "release"
        );
    }

    #[test]
    fn name_override_applies_when_unique() {
        assert_eq!(
            resolve_sync_branch("frontend", "/dev/solo/frontend", &overrides(), "main", true),
            "develop"
        );
    }

    #[test]
    fn name_override_skipped_when_names_clash() {
        assert_eq!(
            resolve_sync_branch(
                "frontend",
                "/dev/beta/frontend",
                &overrides(),
                "main",
                false,
            ),
            "main"
        );
    }
}
