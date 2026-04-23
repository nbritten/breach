use crate::git;
use futures::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use super::{expand, scan_git_repos, MAX_PARALLEL};

#[derive(Serialize, Clone)]
pub struct StaleBranch {
    pub repo_name: String,
    pub repo_path: String,
    pub branch: String,
    pub default_branch: String,
    pub last_commit_ts: i64,
}

async fn branches_in_use(path: &Path) -> HashSet<String> {
    let mut set = HashSet::new();
    let out = match git::git(path, &["worktree", "list", "--porcelain"]).await {
        Ok(s) => s,
        Err(_) => return set,
    };
    for line in out.lines() {
        if let Some(rest) = line.strip_prefix("branch ") {
            let name = rest.trim().trim_start_matches("refs/heads/");
            if !name.is_empty() {
                set.insert(name.to_string());
            }
        }
    }
    set
}

async fn list_stale_in_repo(path: PathBuf, default_branch: String) -> Vec<StaleBranch> {
    let repo_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let repo_path = path.to_string_lossy().to_string();

    let in_use = branches_in_use(&path).await;
    let merged_arg = format!("--merged=origin/{default_branch}");
    let format_arg = "--format=%(refname:short) %(committerdate:unix)";

    // One call yields each merged branch and its last-commit timestamp, avoiding an
    // O(n) `git log` spawn per branch.
    let out = match git::git(
        &path,
        &["for-each-ref", "refs/heads/", &merged_arg, format_arg],
    )
    .await
    {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    out.lines()
        .filter_map(|line| {
            let (name, ts_str) = line.split_once(' ')?;
            let name = name.trim();
            if name.is_empty()
                || name == default_branch
                || in_use.contains(name)
                || name.starts_with('(')
            {
                return None;
            }
            let ts = ts_str.trim().parse::<i64>().ok()?;
            Some(StaleBranch {
                repo_name: repo_name.clone(),
                repo_path: repo_path.clone(),
                branch: name.to_string(),
                default_branch: default_branch.clone(),
                last_commit_ts: ts,
            })
        })
        .collect()
}

/// Across every repo under `repos_path`, list local branches already merged into their
/// default (respecting `branch_overrides`), excluding the default itself and any branch
/// checked out in a worktree.
#[tauri::command]
pub async fn list_stale_branches(
    repos_path: String,
    branch_overrides: HashMap<String, String>,
    default_branch: String,
) -> Result<Vec<StaleBranch>, String> {
    let root = expand(&repos_path);
    let candidates = scan_git_repos(&root).await?;

    let futures = candidates.into_iter().map(|p| {
        let overrides = branch_overrides.clone();
        let fallback = default_branch.clone();
        async move {
            let name = p
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            let branch = overrides.get(&name).cloned().unwrap_or(fallback);
            list_stale_in_repo(p, branch).await
        }
    });
    let results: Vec<Vec<StaleBranch>> = stream::iter(futures)
        .buffer_unordered(MAX_PARALLEL)
        .collect()
        .await;
    Ok(results.into_iter().flatten().collect())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchDeleteRequest {
    pub repo_path: String,
    pub branch: String,
}

#[derive(Serialize)]
pub struct BranchDeleteResult {
    pub repo_path: String,
    pub branch: String,
    pub ok: bool,
    pub error: Option<String>,
}

/// Force-delete a set of branches in parallel (`git branch -D`). The caller is expected
/// to pass only branches known-merged; deletion is still recoverable via reflog.
#[tauri::command]
pub async fn delete_branches(
    branches: Vec<BranchDeleteRequest>,
) -> Result<Vec<BranchDeleteResult>, String> {
    let futures = branches.into_iter().map(|req| async move {
        match git::git(Path::new(&req.repo_path), &["branch", "-D", &req.branch]).await {
            Ok(_) => BranchDeleteResult {
                repo_path: req.repo_path,
                branch: req.branch,
                ok: true,
                error: None,
            },
            Err(e) => BranchDeleteResult {
                repo_path: req.repo_path,
                branch: req.branch,
                ok: false,
                error: Some(e),
            },
        }
    });
    let results: Vec<BranchDeleteResult> = stream::iter(futures)
        .buffer_unordered(MAX_PARALLEL)
        .collect()
        .await;
    Ok(results)
}
