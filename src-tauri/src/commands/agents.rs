use serde::Serialize;
use tokio::process::Command;

/// Coding-agent CLIs we look for. Adding a new one is one line: append the
/// `(stable id, process name)` tuple. The id is what the frontend keys its
/// indicator rendering off of and what shows up in the serialized payload.
///
/// Process names are matched exactly against lsof's command field after its
/// `-c` pre-filter. Pick names exact enough to avoid unrelated tools.
///
/// Mirrored on the frontend in `src/lib/agents.ts` (`AGENT_PROVIDER_ORDER` +
/// `AGENT_INFO`). The two lists must agree on provider ids — if you add one
/// here, add it there. Drift would show up as a session that's detected
/// backend-side but renders no icon.
///
/// Known limitation: an agent launched indirectly (e.g. `bash -c claude` or
/// a wrapper script) may show as `bash` / wrapper-name to lsof and won't
/// match. The two CLIs we ship with today both expose themselves directly.
const AGENT_PROCESS_NAMES: &[(&str, &str)] = &[("claude", "claude"), ("codex", "codex")];

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct AgentSession {
    pub id: String,
    pub provider: String,
    pub repo_path: String,
    pub cwd: String,
    pub pid: u32,
    pub state: &'static str,
}

/// For each known agent CLI, find running processes and report which of
/// `repo_paths` contains each process's cwd. Returns one entry per
/// running process. Process identity matters on the Agents page: two agents
/// working in the same repository are two independently actionable sessions.
#[tauri::command]
pub async fn list_active_agent_sessions(
    repo_paths: Vec<String>,
) -> Result<Vec<AgentSession>, String> {
    if repo_paths.is_empty() {
        return Ok(Vec::new());
    }

    // One targeted lsof invocation replaces `ps` plus one lsof subprocess per
    // matching PID. `-c` is only a coarse pre-filter (it also prefix-matches),
    // so the parser below still requires an exact known process name.
    let mut command = Command::new("lsof");
    command.args(["-a", "-d", "cwd"]);
    for (_, process_name) in AGENT_PROCESS_NAMES {
        command.args(["-c", process_name]);
    }
    command.args(["-F", "pcn"]);
    let output = command
        .output()
        .await
        .map_err(|e| format!("lsof spawn failed: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let detected = parse_lsof_output(&stdout);
    let mut sessions = Vec::new();
    for (pid, provider_id, cwd) in detected {
        for repo_path in &repo_paths {
            if path_contains(repo_path, cwd) {
                sessions.push(AgentSession {
                    id: format!("{provider_id}-{pid}"),
                    provider: provider_id.to_string(),
                    repo_path: repo_path.clone(),
                    cwd: cwd.to_string(),
                    pid,
                    // Process discovery proves that work is active, but it
                    // cannot prove that a provider is awaiting human input.
                    // More specific states are reserved for provider events.
                    state: "working",
                });
                break;
            }
        }
    }
    let mut sessions: Vec<_> = sessions.into_iter().collect();
    sessions.sort_by(|a, b| {
        a.repo_path
            .cmp(&b.repo_path)
            .then_with(|| a.provider.cmp(&b.provider))
            .then_with(|| a.pid.cmp(&b.pid))
    });
    Ok(sessions)
}

/// Parse lsof field output. A process record starts with `p`, `c` carries its
/// command name, and `n` carries the cwd selected by `-d cwd`.
fn parse_lsof_output(stdout: &str) -> Vec<(u32, &str, &str)> {
    let mut pid = None;
    let mut provider = None;
    let mut detected = Vec::new();
    for line in stdout.lines() {
        if let Some(value) = line.strip_prefix('p') {
            pid = value.parse().ok();
            provider = None;
        } else if let Some(command) = line.strip_prefix('c') {
            provider = AGENT_PROCESS_NAMES
                .iter()
                .find_map(|(id, name)| (*name == command).then_some(*id));
        } else if let (Some(pid), Some(id), Some(cwd)) = (pid, provider, line.strip_prefix('n')) {
            detected.push((pid, id, cwd));
        }
    }
    detected
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

    #[test]
    fn parses_known_commands_and_cwds() {
        let out =
            "p101\ncclaude\nfcwd\nn/Users/a/repos/foo\np202\nccodex\nfcwd\nn/Users/a/repos/bar\n";
        assert_eq!(
            parse_lsof_output(out),
            vec![
                (101, "claude", "/Users/a/repos/foo"),
                (202, "codex", "/Users/a/repos/bar"),
            ]
        );
    }

    #[test]
    fn ignores_prefix_matches_and_incomplete_records() {
        let out = "p1\nccodex-code-mode-host\nfcwd\nn/tmp/host\np2\nccodex\nfcwd\np3\nn/tmp/missing-command\n";
        assert!(parse_lsof_output(out).is_empty());
    }

    #[test]
    fn keeps_multiple_processes_in_the_same_repo_distinct() {
        let out =
            "p10\nccodex\nfcwd\nn/Users/a/repos/foo\np11\nccodex\nfcwd\nn/Users/a/repos/foo\n";
        assert_eq!(
            parse_lsof_output(out),
            vec![
                (10, "codex", "/Users/a/repos/foo"),
                (11, "codex", "/Users/a/repos/foo"),
            ]
        );
    }
}
