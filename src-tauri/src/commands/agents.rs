use std::collections::HashSet;

use tokio::process::Command;

/// Find which of `repo_paths` currently has a `claude` (Claude Code CLI)
/// process whose working directory lives inside it. Process scan is done
/// with `ps` + `lsof` — both cheap, no extra dependencies.
///
/// Returns the subset of input paths that have at least one active session.
/// Empty `repo_paths` short-circuits.
#[tauri::command]
pub async fn list_active_claude_sessions(
    repo_paths: Vec<String>,
) -> Result<Vec<String>, String> {
    if repo_paths.is_empty() {
        return Ok(Vec::new());
    }

    let pids = claude_pids().await?;
    if pids.is_empty() {
        return Ok(Vec::new());
    }

    let mut active: HashSet<String> = HashSet::new();
    for pid in pids {
        let Some(cwd) = process_cwd(pid).await else {
            continue;
        };
        for repo_path in &repo_paths {
            if path_contains(repo_path, &cwd) {
                active.insert(repo_path.clone());
                break;
            }
        }
    }
    Ok(active.into_iter().collect())
}

/// PIDs of running processes whose command name is exactly `claude` (matches
/// the Claude Code CLI; ignores anything else with `claude` in the path).
async fn claude_pids() -> Result<Vec<u32>, String> {
    let output = Command::new("ps")
        .args(["-axo", "pid=,comm="])
        .output()
        .await
        .map_err(|e| format!("ps spawn failed: {e}"))?;
    if !output.status.success() {
        return Err("ps returned non-zero".into());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            let mut parts = line.splitn(2, char::is_whitespace);
            let pid_str = parts.next()?;
            let comm = parts.next()?.trim();
            let name = comm.rsplit('/').next().unwrap_or(comm);
            if name == "claude" {
                pid_str.parse().ok()
            } else {
                None
            }
        })
        .collect())
}

/// Working directory of a process by PID, via `lsof -F n -d cwd`. Returns
/// `None` on any failure (process gone, lsof unavailable, weird output).
async fn process_cwd(pid: u32) -> Option<String> {
    let output = Command::new("lsof")
        .args(["-p", &pid.to_string(), "-a", "-d", "cwd", "-F", "n"])
        .output()
        .await
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    // `-F n` emits one field per line, each prefixed with a 1-char tag; the
    // `n` (name) line carries the cwd. There can be multiple lines; take the
    // first that decodes.
    stdout
        .lines()
        .find_map(|l| l.strip_prefix('n').map(|s| s.to_string()))
}

/// True if `cwd` equals `repo` or is a descendant of it. Exact-prefix match
/// guarded with a separator so `/Users/a/repos/foo-bar` doesn't claim to
/// contain `/Users/a/repos/foo`.
fn path_contains(repo: &str, cwd: &str) -> bool {
    if cwd == repo {
        return true;
    }
    let with_sep = format!("{}{}", repo, std::path::MAIN_SEPARATOR);
    cwd.starts_with(&with_sep)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_contains_exact_match() {
        assert!(path_contains("/Users/a/repos/foo", "/Users/a/repos/foo"));
    }

    #[test]
    fn path_contains_subdir() {
        assert!(path_contains(
            "/Users/a/repos/foo",
            "/Users/a/repos/foo/src"
        ));
    }

    #[test]
    fn path_contains_rejects_sibling_with_shared_prefix() {
        // "/Users/a/repos/foo-bar" starts with "/Users/a/repos/foo" textually
        // but is a sibling repo, not a descendant.
        assert!(!path_contains(
            "/Users/a/repos/foo",
            "/Users/a/repos/foo-bar"
        ));
    }

    #[test]
    fn path_contains_rejects_unrelated() {
        assert!(!path_contains("/Users/a/repos/foo", "/tmp/elsewhere"));
    }
}

