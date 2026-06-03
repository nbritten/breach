use std::collections::HashSet;

use futures::future::join_all;
use serde::Serialize;
use tokio::process::Command;

/// Coding-agent CLIs we look for. Adding a new one is one line: append the
/// `(stable id, process name)` tuple. The id is what the frontend keys its
/// indicator rendering off of and what shows up in the serialized payload.
///
/// Process names are matched against the basename of `ps -axo comm=`, so
/// `claude`, `/opt/homebrew/bin/claude`, and `node-bin/claude` all match
/// `claude`. Pick names exact enough to avoid colliding with unrelated tools.
///
/// Mirrored on the frontend in `src/lib/agents.ts` (`AGENT_PROVIDER_ORDER` +
/// `AGENT_INFO`). The two lists must agree on provider ids — if you add one
/// here, add it there. Drift would show up as a session that's detected
/// backend-side but renders no icon.
///
/// Known limitation: an agent launched indirectly (e.g. `bash -c claude` or
/// a wrapper script) may show as `bash` / wrapper-name in `comm` and won't
/// match. The two CLIs we ship with today both expose themselves directly.
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

    // Collect all (provider, pid) pairs we need to resolve a cwd for, then
    // fire the lsof calls in parallel — they're independent and each takes
    // tens of ms, so serializing them adds up on machines with several
    // running agents.
    let lookups: Vec<(&str, u32)> = AGENT_PROCESS_NAMES
        .iter()
        .flat_map(|(provider_id, process_name)| {
            all_pids
                .iter()
                .find(|(name, _)| name == process_name)
                .map(|(_, pids)| pids.iter().map(move |p| (*provider_id, *p)))
                .into_iter()
                .flatten()
        })
        .collect();

    let cwds = join_all(lookups.iter().map(|(_, pid)| process_cwd(*pid))).await;

    let mut sessions: HashSet<AgentSession> = HashSet::new();
    for ((provider_id, _pid), cwd) in lookups.into_iter().zip(cwds) {
        let Some(cwd) = cwd else { continue };
        for repo_path in &repo_paths {
            if path_contains(repo_path, &cwd) {
                sessions.insert(AgentSession {
                    provider: provider_id.to_string(),
                    repo_path: repo_path.clone(),
                });
                break;
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
    Ok(parse_ps_output(&stdout))
}

/// Pure parser for the output of `ps -axo pid=,comm=`. Whitespace-separated,
/// pid first, command path (or basename) second. Unparseable lines are
/// silently dropped — ps occasionally emits odd entries during racy reads.
fn parse_ps_output(stdout: &str) -> Vec<(String, Vec<u32>)> {
    let mut buckets: std::collections::HashMap<String, Vec<u32>> =
        std::collections::HashMap::new();
    for line in stdout.lines() {
        let line = line.trim();
        let mut parts = line.splitn(2, char::is_whitespace);
        let (Some(pid_str), Some(comm)) = (parts.next(), parts.next()) else {
            continue;
        };
        let comm = comm.trim();
        if comm.is_empty() {
            continue;
        }
        let basename = comm.rsplit('/').next().unwrap_or(comm);
        let Ok(pid) = pid_str.parse::<u32>() else {
            continue;
        };
        buckets.entry(basename.to_string()).or_default().push(pid);
    }
    buckets.into_iter().collect()
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

    fn pids_for<'a>(parsed: &'a [(String, Vec<u32>)], name: &str) -> &'a [u32] {
        parsed
            .iter()
            .find(|(n, _)| n == name)
            .map(|(_, v)| v.as_slice())
            .unwrap_or(&[])
    }

    #[test]
    fn parses_padded_pids_and_bare_basenames() {
        let out = "  101 claude\n  202 codex\n";
        let parsed = parse_ps_output(out);
        assert_eq!(pids_for(&parsed, "claude"), &[101]);
        assert_eq!(pids_for(&parsed, "codex"), &[202]);
    }

    #[test]
    fn extracts_basename_from_pathful_comm() {
        let out = "303 /opt/homebrew/bin/claude\n";
        let parsed = parse_ps_output(out);
        assert_eq!(pids_for(&parsed, "claude"), &[303]);
    }

    #[test]
    fn buckets_multiple_pids_for_same_command() {
        let out = "1 claude\n2 claude\n3 claude\n";
        let parsed = parse_ps_output(out);
        assert_eq!(pids_for(&parsed, "claude"), &[1, 2, 3]);
    }

    #[test]
    fn drops_unparseable_lines() {
        let out = "not-a-number claude\nabc\n\n42 codex\n";
        let parsed = parse_ps_output(out);
        assert_eq!(pids_for(&parsed, "claude"), &[] as &[u32]);
        assert_eq!(pids_for(&parsed, "codex"), &[42]);
    }

    #[test]
    fn ignores_empty_comm() {
        let out = "55 \n66 codex\n";
        let parsed = parse_ps_output(out);
        assert_eq!(pids_for(&parsed, "codex"), &[66]);
    }
}
