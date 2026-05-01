use crate::git;
use futures::future::join_all;
use futures::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::fs;
use tokio::process::Command;

use super::{expand, MAX_PARALLEL};

pub(crate) async fn gh_available() -> bool {
    Command::new("gh")
        .arg("--version")
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

// ---------- CI status ----------

#[derive(Deserialize)]
pub struct CiRequest {
    pub path: String,
    pub branch: String,
}

#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum CiState {
    Success,
    Failure,
    InProgress,
    Other,
}

#[derive(Serialize, Clone)]
pub struct CiStatus {
    pub state: CiState,
    pub conclusion: Option<String>,
    pub workflow: Option<String>,
    pub url: Option<String>,
}

#[derive(Deserialize)]
struct RawCiRun {
    status: Option<String>,
    conclusion: Option<String>,
    #[serde(rename = "workflowName")]
    workflow_name: Option<String>,
    url: Option<String>,
}

async fn fetch_ci_for(req: CiRequest) -> (String, Option<CiStatus>) {
    let path = PathBuf::from(&req.path);
    let Some(slug) = git::origin_slug(&path).await else {
        return (req.path, None);
    };
    if req.branch.trim().is_empty() {
        return (req.path, None);
    }
    let output = Command::new("gh")
        .args([
            "run",
            "list",
            "-R",
            &slug,
            "--branch",
            &req.branch,
            "--limit",
            "1",
            "--json",
            "status,conclusion,workflowName,url",
        ])
        .output()
        .await;
    let runs: Vec<RawCiRun> = match output {
        Ok(o) if o.status.success() => serde_json::from_slice(&o.stdout).unwrap_or_default(),
        _ => return (req.path, None),
    };
    let Some(run) = runs.into_iter().next() else {
        return (req.path, None);
    };
    let status = run.status.unwrap_or_default();
    let state = match status.as_str() {
        "in_progress" | "queued" | "pending" | "requested" | "waiting" => CiState::InProgress,
        _ => match run.conclusion.as_deref() {
            Some("success") => CiState::Success,
            Some("failure") | Some("timed_out") => CiState::Failure,
            _ => CiState::Other,
        },
    };
    (
        req.path,
        Some(CiStatus {
            state,
            conclusion: run.conclusion,
            workflow: run.workflow_name,
            url: run.url,
        }),
    )
}

/// For each (repo path, branch) pair, return the most recent GitHub Actions run's state.
/// Repos without a resolvable origin slug, empty branch, or no matching runs are skipped.
#[tauri::command]
pub async fn list_ci_status(
    repos: Vec<CiRequest>,
) -> Result<HashMap<String, CiStatus>, String> {
    if repos.is_empty() {
        return Ok(HashMap::new());
    }
    if !gh_available().await {
        return Err("gh CLI not found".into());
    }
    let results: Vec<(String, Option<CiStatus>)> =
        stream::iter(repos.into_iter().map(fetch_ci_for))
            .buffer_unordered(MAX_PARALLEL)
            .collect()
            .await;
    let mut out = HashMap::new();
    for (path, status) in results {
        if let Some(s) = status {
            out.insert(path, s);
        }
    }
    Ok(out)
}

// ---------- My PRs ----------

#[derive(Serialize, Clone)]
pub struct PrInfo {
    pub number: u64,
    pub title: String,
    pub url: String,
    pub is_draft: bool,
    pub repo: String,
}

#[derive(Serialize, Default)]
pub struct MyPrs {
    pub authored: HashMap<String, Vec<PrInfo>>,
    pub review_requested: HashMap<String, Vec<PrInfo>>,
    /// Per-org errors (key: `<org> (authored)` / `<org> (review)`).
    /// One org failing doesn't discard results from the others.
    pub errors: HashMap<String, String>,
}

#[derive(Deserialize)]
struct RawRepo {
    name: String,
}

#[derive(Deserialize)]
struct RawPr {
    number: u64,
    title: String,
    url: String,
    #[serde(default, rename = "isDraft")]
    is_draft: bool,
    repository: RawRepo,
}

#[derive(Clone, Copy)]
enum PrRole {
    Authored,
    ReviewRequested,
}

impl PrRole {
    fn filter_flag(self) -> &'static str {
        match self {
            PrRole::Authored => "--author",
            PrRole::ReviewRequested => "--review-requested",
        }
    }

    fn label(self) -> &'static str {
        match self {
            PrRole::Authored => "authored",
            PrRole::ReviewRequested => "review",
        }
    }
}

async fn run_pr_search(org: String, role: PrRole) -> Result<Vec<PrInfo>, String> {
    let filter_flag = role.filter_flag();
    let output = Command::new("gh")
        .args([
            "search",
            "prs",
            "--state",
            "open",
            filter_flag,
            "@me",
            "--owner",
            &org,
            "--limit",
            "200",
            "--json",
            "repository,number,title,url,isDraft",
        ])
        .output()
        .await
        .map_err(|e| format!("gh spawn failed: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let raw: Vec<RawPr> = serde_json::from_str(&stdout)
        .map_err(|e| format!("parse {} prs: {e}", role.label()))?;
    Ok(raw
        .into_iter()
        .map(|p| PrInfo {
            number: p.number,
            title: p.title,
            url: p.url,
            is_draft: p.is_draft,
            repo: p.repository.name,
        })
        .collect())
}

/// Search GitHub across the given orgs for open PRs authored by `@me` and PRs awaiting
/// review from `@me`. Per-org failures are captured in `errors` rather than aborting.
#[tauri::command]
pub async fn list_my_prs(orgs: Vec<String>) -> Result<MyPrs, String> {
    let mut out = MyPrs::default();
    let orgs: Vec<String> = orgs
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if orgs.is_empty() {
        return Ok(out);
    }
    if !gh_available().await {
        return Err("gh CLI not found. Install with: brew install gh && gh auth login".into());
    }

    let tasks = orgs.into_iter().map(|org| async move {
        let a = run_pr_search(org.clone(), PrRole::Authored).await;
        let r = run_pr_search(org.clone(), PrRole::ReviewRequested).await;
        (org, a, r)
    });
    for (org, a, r) in join_all(tasks).await {
        match a {
            Ok(prs) => {
                for pr in prs {
                    out.authored.entry(pr.repo.clone()).or_default().push(pr);
                }
            }
            Err(e) => {
                out.errors.insert(format!("{org} (authored)"), e);
            }
        }
        match r {
            Ok(prs) => {
                for pr in prs {
                    out.review_requested
                        .entry(pr.repo.clone())
                        .or_default()
                        .push(pr);
                }
            }
            Err(e) => {
                out.errors.insert(format!("{org} (review)"), e);
            }
        }
    }
    Ok(out)
}

// ---------- Clone missing ----------

#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum CloneStatus {
    Cloned,
    Exists,
    Error,
}

#[derive(Serialize)]
pub struct CloneResult {
    pub slug: String,
    pub name: String,
    pub path: String,
    pub status: CloneStatus,
    pub error: Option<String>,
}

async fn list_org_repos(org: &str) -> Result<Vec<String>, String> {
    let output = Command::new("gh")
        .args([
            "repo", "list", org, "--limit", "1000", "--no-archived", "--json", "name", "--jq",
            ".[].name",
        ])
        .output()
        .await
        .map_err(|e| format!("gh spawn failed: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect())
}

/// List `org/name` slugs in the given orgs that aren't already cloned under
/// `repos_path`. Sorted alphabetically. The frontend uses this to populate the
/// Clone-missing picker before the user chooses which to clone.
///
/// If `repos_path` doesn't exist yet, every repo in the org is "missing" — the
/// directory is created lazily by `clone_repos` once the user picks something.
#[tauri::command]
pub async fn list_missing_repos(
    repos_path: String,
    orgs: Vec<String>,
) -> Result<Vec<String>, String> {
    if !gh_available().await {
        return Err("gh CLI not found. Install with: brew install gh && gh auth login".into());
    }
    let root = expand(&repos_path);

    let mut slugs: Vec<String> = Vec::new();
    for org in orgs.iter().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        let names = list_org_repos(org)
            .await
            .map_err(|e| format!("listing org {org}: {e}"))?;
        for n in names {
            if !root.join(&n).exists() {
                slugs.push(format!("{org}/{n}"));
            }
        }
    }
    slugs.sort();
    slugs.dedup();
    Ok(slugs)
}

/// Clone the given `org/name` slugs into `repos_path` in parallel. The caller is
/// responsible for picking the slugs (typically from `list_missing_repos`); this
/// command does no filtering of its own.
#[tauri::command]
pub async fn clone_repos(
    repos_path: String,
    slugs: Vec<String>,
) -> Result<Vec<CloneResult>, String> {
    if !gh_available().await {
        return Err("gh CLI not found. Install with: brew install gh && gh auth login".into());
    }
    let root = expand(&repos_path);
    fs::create_dir_all(&root)
        .await
        .map_err(|e| format!("cannot create {}: {e}", root.display()))?;

    let entries: Vec<(String, String, PathBuf)> = slugs
        .into_iter()
        .filter_map(|s| {
            let name = s.rsplit('/').next()?.to_string();
            let target = root.join(&name);
            Some((s, name, target))
        })
        .collect();

    let futures = entries.into_iter().map(|(slug, name, target)| async move {
        let path_str = target.to_string_lossy().to_string();
        if target.exists() {
            return CloneResult {
                slug,
                name,
                path: path_str,
                status: CloneStatus::Exists,
                error: None,
            };
        }
        let output = Command::new("gh")
            .arg("repo")
            .arg("clone")
            .arg(&slug)
            .arg(&target)
            .output()
            .await;
        match output {
            Ok(o) if o.status.success() => CloneResult {
                slug,
                name,
                path: path_str,
                status: CloneStatus::Cloned,
                error: None,
            },
            Ok(o) => CloneResult {
                slug,
                name,
                path: path_str,
                status: CloneStatus::Error,
                error: Some(String::from_utf8_lossy(&o.stderr).trim().to_string()),
            },
            Err(e) => CloneResult {
                slug,
                name,
                path: path_str,
                status: CloneStatus::Error,
                error: Some(format!("spawn failed: {e}")),
            },
        }
    });

    let results: Vec<CloneResult> = stream::iter(futures)
        .buffer_unordered(MAX_PARALLEL)
        .collect()
        .await;
    Ok(results)
}
