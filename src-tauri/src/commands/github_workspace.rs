//! GitHub workspace commands. Fixed endpoints and JSON stdin keep untrusted
//! repository content and comment bodies out of shell command interpretation.
use serde::Deserialize;
use serde_json::{json, Value};
use std::{process::Stdio, time::Duration};
use tokio::{io::AsyncWriteExt, process::Command};

fn target(repo: &str, number: u64) -> Result<String, String> {
    let parts: Vec<_> = repo.split('/').collect();
    if parts.len() != 2
        || number == 0
        || parts.iter().any(|part| {
            part.is_empty()
                || *part == "."
                || *part == ".."
                || !part
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
        })
    {
        return Err("Invalid repository or pull request number".into());
    }
    Ok(format!("repos/{repo}/pulls/{number}"))
}
fn validate_sha(sha: &str) -> Result<(), String> {
    if sha.len() != 40 || !sha.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("Refresh this pull request before continuing".into());
    }
    Ok(())
}
fn validate_body(body: &str) -> Result<(), String> {
    if body.trim().is_empty() || body.len() > 65000 {
        return Err("Enter a comment of at most 65,000 bytes".into());
    }
    Ok(())
}

async fn run(args: &[&str], input: Option<Value>) -> Result<String, String> {
    let mut command = Command::new("gh");
    command
        .args(args)
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_PAGER", "cat")
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not run GitHub CLI. Install gh and run gh auth login. {e}"))?;
    let operation = async move {
        if let Some(body) = input {
            let mut stdin = child.stdin.take().ok_or("Could not write GitHub request")?;
            stdin
                .write_all(body.to_string().as_bytes())
                .await
                .map_err(|e| e.to_string())?;
            drop(stdin);
        }
        let output = child.wait_with_output().await.map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    };
    tokio::time::timeout(Duration::from_secs(60), operation).await
        .map_err(|_| "GitHub did not respond in time. Refresh to check whether your action completed before trying again.".to_string())?
}
async fn get(endpoint: &str) -> Result<Value, String> {
    let text = run(&["api", "--hostname", "github.com", endpoint], None).await?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}
async fn write(endpoint: &str, method: &str, body: Value) -> Result<Value, String> {
    let text = run(
        &[
            "api",
            "--hostname",
            "github.com",
            endpoint,
            "--method",
            method,
            "--input",
            "-",
        ],
        Some(body),
    )
    .await?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}
async fn all(endpoint: &str) -> Result<Value, String> {
    let text = run(
        &[
            "api",
            "--hostname",
            "github.com",
            endpoint,
            "--paginate",
            "--slurp",
        ],
        None,
    )
    .await?;
    let pages: Vec<Vec<Value>> = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(Value::Array(pages.into_iter().flatten().collect()))
}
async fn unchanged(endpoint: &str, sha: &str) -> Result<Value, String> {
    validate_sha(sha)?;
    let pr = get(endpoint).await?;
    ensure_head(&pr, sha)?;
    Ok(pr)
}

fn ensure_head(pr: &Value, sha: &str) -> Result<(), String> {
    if pr["head"]["sha"].as_str() != Some(sha) {
        return Err(
            "New commits were pushed. Refresh and review the latest changes before continuing."
                .into(),
        );
    }
    Ok(())
}

#[tauri::command]
pub async fn github_search(queue: String, query: String, page: u32) -> Result<Value, String> {
    if !(1..=20).contains(&page) || query.len() > 1000 {
        return Err("Invalid search".into());
    }
    let login = get("user").await?;
    let user = login["login"]
        .as_str()
        .ok_or("GitHub did not return an account")?;
    let filter = match queue.as_str() {
        "review" => format!("is:open review-requested:{user}"),
        "authored" => format!("is:open author:{user}"),
        "involved" => format!("is:open involves:{user}"),
        "search" => String::new(),
        _ => return Err("Unknown pull request inbox".into()),
    };
    let text = run(
        &[
            "api",
            "--hostname",
            "github.com",
            "search/issues",
            "--method",
            "GET",
            "-f",
            &format!("q=is:pr {filter} {query}"),
            "-f",
            "sort=updated",
            "-f",
            "order=desc",
            "-f",
            "per_page=50",
            "-f",
            &format!("page={page}"),
        ],
        None,
    )
    .await?;
    let mut result: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    result["login"] = json!(user);
    Ok(result)
}

#[tauri::command]
pub async fn github_detail(repo: String, number: u64) -> Result<Value, String> {
    let endpoint = target(&repo, number)?;
    let repository_endpoint = format!("repos/{repo}");
    let number_text = number.to_string();
    let full_repo = format!("github.com/{repo}");
    let args = [
        "pr",
        "view",
        &number_text,
        "--repo",
        &full_repo,
        "--json",
        "statusCheckRollup,reviewDecision,headRefOid",
    ];
    let (pr, repository, viewer, checks) = tokio::try_join!(
        get(&endpoint),
        get(&repository_endpoint),
        get("user"),
        run(&args, None)
    )?;
    let checks: Value = serde_json::from_str(&checks).map_err(|e| e.to_string())?;
    if pr["head"]["sha"] != checks["headRefOid"] {
        return Err("New commits were pushed while loading. Refresh this pull request.".into());
    }
    Ok(json!({ "pr": pr, "repository": repository, "viewer": viewer["login"], "checks": checks }))
}

#[tauri::command]
pub async fn github_conversation(repo: String, number: u64) -> Result<Value, String> {
    let endpoint = target(&repo, number)?;
    let comments_endpoint = format!("repos/{repo}/issues/{number}/comments?per_page=100");
    let reviews_endpoint = format!("{endpoint}/reviews?per_page=100");
    let inline_endpoint = format!("{endpoint}/comments?per_page=100");
    let (comments, reviews, inline) = tokio::try_join!(
        all(&comments_endpoint),
        all(&reviews_endpoint),
        all(&inline_endpoint)
    )?;
    Ok(json!({ "comments": comments, "reviews": reviews, "inline": inline }))
}

#[tauri::command]
pub async fn github_files(repo: String, number: u64, sha: String) -> Result<Value, String> {
    let endpoint = target(&repo, number)?;
    let before = unchanged(&endpoint, &sha).await?;
    let files = all(&format!("{endpoint}/files?per_page=100")).await?;
    let after = unchanged(&endpoint, &sha).await?;
    if before["base"]["sha"] != after["base"]["sha"] {
        return Err("The base branch changed while loading. Refresh the diff.".into());
    }
    Ok(files)
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PrAction {
    Comment {
        body: String,
    },
    Review {
        body: String,
        event: String,
        sha: String,
    },
    Inline {
        body: String,
        sha: String,
        path: String,
        line: u32,
        side: String,
    },
    Reply {
        body: String,
        comment_id: u64,
    },
    Merge {
        sha: String,
        method: String,
    },
}

#[tauri::command]
pub async fn github_action(repo: String, number: u64, action: PrAction) -> Result<Value, String> {
    let endpoint = target(&repo, number)?;
    match action {
        PrAction::Comment { body } => {
            validate_body(&body)?;
            write(
                &format!("repos/{repo}/issues/{number}/comments"),
                "POST",
                json!({ "body": body }),
            )
            .await
        }
        PrAction::Review { body, event, sha } => {
            if !["APPROVE", "REQUEST_CHANGES", "COMMENT"].contains(&event.as_str()) {
                return Err("Invalid review action".into());
            }
            if event != "APPROVE" || !body.is_empty() {
                validate_body(&body)?;
            }
            unchanged(&endpoint, &sha).await?;
            write(
                &format!("{endpoint}/reviews"),
                "POST",
                json!({ "body": body, "event": event, "commit_id": sha }),
            )
            .await
        }
        PrAction::Inline {
            body,
            sha,
            path,
            line,
            side,
        } => {
            validate_body(&body)?;
            if path.is_empty() || line == 0 || !["LEFT", "RIGHT"].contains(&side.as_str()) {
                return Err("Invalid diff location".into());
            }
            unchanged(&endpoint, &sha).await?;
            write(
                &format!("{endpoint}/comments"),
                "POST",
                json!({ "body": body, "commit_id": sha, "path": path, "line": line, "side": side }),
            )
            .await
        }
        PrAction::Reply { body, comment_id } => {
            validate_body(&body)?;
            if comment_id == 0 {
                return Err("Invalid comment".into());
            }
            write(
                &format!("{endpoint}/comments/{comment_id}/replies"),
                "POST",
                json!({ "body": body }),
            )
            .await
        }
        PrAction::Merge { sha, method } => {
            validate_sha(&sha)?;
            if !["merge", "squash", "rebase"].contains(&method.as_str()) {
                return Err("Invalid merge method".into());
            }
            let result = write(
                &format!("{endpoint}/merge"),
                "PUT",
                json!({ "sha": sha, "merge_method": method }),
            )
            .await?;
            if result["merged"] != true {
                return Err(result["message"]
                    .as_str()
                    .unwrap_or("GitHub did not merge this pull request")
                    .into());
            }
            Ok(result)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_new_commits_and_missing_heads_before_reviewing() {
        let inspected = "a".repeat(40);
        assert!(ensure_head(&json!({ "head": { "sha": inspected } }), &inspected).is_ok());
        assert!(ensure_head(&json!({ "head": { "sha": "b".repeat(40) } }), &inspected).is_err());
        assert!(ensure_head(&json!({}), &inspected).is_err());
    }
    #[test]
    fn validates_repository_targets() {
        assert!(target("acme/my.repo-1", 12).is_ok());
        for repo in [
            "../repo", "a/b/c", "a/b?x=y", "a/b#c", "a/", "a/..", "-R x/y",
        ] {
            assert!(target(repo, 1).is_err());
        }
        assert!(target("a/b", 0).is_err());
    }
    #[test]
    fn validates_review_inputs() {
        assert!(validate_sha(&"a".repeat(40)).is_ok());
        assert!(validate_sha("main").is_err());
        assert!(validate_body("  ").is_err());
        assert!(validate_body("$(echo example) `literal`\nReview text").is_ok());
        assert!(validate_body(&"x".repeat(65001)).is_err());
    }
}
