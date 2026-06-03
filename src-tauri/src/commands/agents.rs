use std::collections::HashSet;

use serde::Serialize;
use tokio::process::Command;

/// Coding-agent CLIs we look for. Adding a new one is one line: append the
/// `(stable id, process name)` tuple. The id is what the frontend keys its
/// indicator rendering off of and what shows up in the serialized payload.
///
/// Process names are matched against the basename of `ps -axo comm=`, so
/// `claude`, `/opt/homebrew/bin/claude`, and `node-bin/claude` all match
/// `claude`. Pick names exact enough to avoid colliding with unrelated tools.
const AGENT_PROCESS_NAMES: &[(&str, &str)] = &[
    ("claude", "claude"),
    ("codex", "codex"),
];

#[derive(Serialize, Debug, Clone, PartialEq, Eq, Hash)]
pub struct AgentSession {
    pub provider: String,
    pub repo_path: String,
}

/// For each known agent CLI, find running processes and report which of
/// `repo_paths` contains each process's cwd. Returns one entry per
/// `(provider, repo)` pair — multiple processes for the same provider in
/// the same repo collapse to a single session entry.
#[tauri::command]
pub async fn list_active_agent_sessions(
    repo_paths: Vec<String>,
) -> Result<Vec<AgentSession>, String> {
    if repo_paths.is_empty() {
        return Ok(Vec::new());
    }

    let all_pids = ps_pids_by_name().await?;
    if all_pids.is_empty() {
        return Ok(Vec::new());
    }

    let mut sessions: HashSet<AgentSession> = HashSet::new();
    for (provider_id, process_name) in AGENT_PROCESS_NAMES {
        let Some(pids) = all_pids.iter().find_map(|(name, pids)| {
            if name == process_name {
                Some(pids)
            } else {
                None
            }
        }) else {
            continue;
        };
        for pid in pids {
            let Some(cwd) = process_cwd(*pid).await else {
                continue;
            };
            for repo_path in &repo_paths {
                if path_contains(repo_path, &cwd) {
                    sessions.insert(AgentSession {
                        provider: (*provider_id).to_string(),
                        repo_path: repo_path.clone(),
                    });
                    break;
                }
            }
        }
    }
    Ok(sessions.into_iter().collect())
}

/// Parse `ps -axo pid=,comm=` once into `name -> Vec<pid>`. Cheaper than
/// running ps once per provider when we add more agents.
async fn ps_pids_by_name() -> Result<Vec<(String, Vec<u32>)>, String> {
    let output = Command::new("ps")
        .args(["-axo", "pid=,comm="])
        .output()
        .await
        .map_err(|e| format!("ps spawn failed: {e}"))?;
    if !output.status.success() {
        return Err("ps returned non-zero".into());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut buckets: std::collections::HashMap<String, Vec<u32>> =
        std::collections::HashMap::new();
    for line in stdout.lines() {
        let line = line.trim();
        let mut parts = line.splitn(2, char::is_whitespace);
        let (Some(pid_str), Some(comm)) = (parts.next(), parts.next()) else {
            continue;
        };
        let comm = comm.trim();
        let basename = comm.rsplit('/').next().unwrap_or(comm);
        let Ok(pid) = pid_str.parse::<u32>() else {
            continue;
        };
        buckets.entry(basename.to_string()).or_default().push(pid);
    }
    Ok(buckets.into_iter().collect())
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
