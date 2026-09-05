use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::Stdio;
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attention_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<u64>,
    pub connection: &'static str,
}

#[derive(Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ClaudeSession {
    cwd: String,
    kind: String,
    name: String,
    pid: u32,
    session_id: String,
    started_at: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodexThread {
    id: String,
    cwd: String,
    name: Option<String>,
    preview: String,
    status: CodexThreadStatus,
    updated_at: u64,
}

#[derive(Deserialize, Debug)]
struct CodexThreadStatus {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default, rename = "activeFlags")]
    active_flags: Vec<String>,
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
                    title: None,
                    attention_reason: None,
                    last_message: None,
                    updated_at: None,
                    connection: "process",
                });
                break;
            }
        }
    }

    // Claude exposes stable session metadata through its own CLI. Enrich the
    // process snapshot when available, but keep lsof as the provider-neutral
    // fallback when the command is absent or its JSON contract changes.
    if let Ok(output) = Command::new("claude")
        .args(["agents", "--json"])
        .output()
        .await
    {
        if output.status.success() {
            for native in parse_claude_sessions(&output.stdout) {
                let Some(repo_path) = repo_paths
                    .iter()
                    .find(|repo| path_contains(repo, &native.cwd))
                else {
                    continue;
                };
                if let Some(existing) = sessions
                    .iter_mut()
                    .find(|session| session.provider == "claude" && session.pid == native.pid)
                {
                    existing.id = native.session_id;
                    existing.cwd = native.cwd;
                    existing.title = (!native.name.is_empty()).then_some(native.name);
                    existing.updated_at = Some(native.started_at);
                    existing.connection = "claude";
                } else {
                    sessions.push(AgentSession {
                        id: native.session_id,
                        provider: "claude".into(),
                        repo_path: repo_path.clone(),
                        cwd: native.cwd,
                        pid: native.pid,
                        state: "working",
                        title: (!native.name.is_empty()).then_some(native.name),
                        attention_reason: None,
                        last_message: None,
                        updated_at: Some(native.started_at),
                        connection: "claude",
                    });
                }
            }
        }
    }

    let codex_repos = repo_paths.clone();
    if let Ok(native_sessions) =
        tokio::task::spawn_blocking(move || list_codex_threads(&codex_repos)).await
    {
        for native in &native_sessions {
            sessions.retain(|session| {
                !(session.provider == "codex"
                    && session.connection == "process"
                    && session.repo_path == native.repo_path)
            });
        }
        sessions.extend(native_sessions);
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

fn parse_claude_sessions(stdout: &[u8]) -> Vec<ClaudeSession> {
    serde_json::from_slice(stdout).unwrap_or_default()
}

fn list_codex_threads(repo_paths: &[String]) -> Vec<AgentSession> {
    let mut child = match std::process::Command::new("codex")
        .args(["app-server", "--stdio"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => child,
        Err(_) => return Vec::new(),
    };
    let mut stdin = child.stdin.take().expect("piped stdin");
    let stdout = child.stdout.take().expect("piped stdout");
    let mut reader = BufReader::new(stdout);

    let initialize = r#"{"id":1,"method":"initialize","params":{"clientInfo":{"name":"breach","version":"0.6.0"}}}"#;
    if writeln!(stdin, "{initialize}")
        .and_then(|_| stdin.flush())
        .is_err()
    {
        return Vec::new();
    }
    if read_response(&mut reader, 1).is_none_or(|value| value.get("result").is_none()) {
        return Vec::new();
    }
    let request = r#"{"id":2,"method":"thread/list","params":{"limit":100,"sortKey":"updated_at","sortDirection":"desc","archived":false,"useStateDbOnly":true}}"#;
    if writeln!(stdin, "{{\"method\":\"initialized\"}}")
        .and_then(|_| writeln!(stdin, "{request}"))
        .and_then(|_| stdin.flush())
        .is_err()
    {
        return Vec::new();
    }
    let response = read_response(&mut reader, 2).unwrap_or_default();
    let _ = child.kill();
    let threads: Vec<CodexThread> = response
        .pointer("/result/data")
        .and_then(|data| serde_json::from_value(data.clone()).ok())
        .unwrap_or_default();

    threads
        .into_iter()
        .filter_map(|thread| {
            let (state, attention_reason) = match thread.status.kind.as_str() {
                "active"
                    if thread
                        .status
                        .active_flags
                        .iter()
                        .any(|flag| flag == "waitingOnApproval") =>
                {
                    (
                        "needs_approval",
                        Some("Codex is waiting for approval.".into()),
                    )
                }
                "active"
                    if thread
                        .status
                        .active_flags
                        .iter()
                        .any(|flag| flag == "waitingOnUserInput") =>
                {
                    (
                        "needs_input",
                        Some("Codex is waiting for your answer.".into()),
                    )
                }
                "active" => ("working", None),
                "idle" => ("idle", None),
                "systemError" => ("failed", Some("Codex reported a system error.".into())),
                _ => return None,
            };
            let repo_path = repo_paths
                .iter()
                .find(|repo| path_contains(repo, &thread.cwd))?;
            let preview = (!thread.preview.is_empty()).then_some(thread.preview);
            let title = thread
                .name
                .filter(|name| !name.is_empty())
                .or_else(|| preview.clone());
            Some(AgentSession {
                id: thread.id,
                provider: "codex".into(),
                repo_path: repo_path.clone(),
                cwd: thread.cwd,
                pid: 0,
                state,
                title,
                attention_reason,
                last_message: preview,
                updated_at: Some(thread.updated_at.saturating_mul(1000)),
                connection: "codex",
            })
        })
        .collect()
}

fn read_response(reader: &mut impl BufRead, expected_id: u64) -> Option<serde_json::Value> {
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line).ok()? == 0 {
            return None;
        }
        let value: serde_json::Value = serde_json::from_str(&line).ok()?;
        if value.get("id").and_then(serde_json::Value::as_u64) == Some(expected_id) {
            return Some(value);
        }
    }
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

    #[test]
    fn parses_claude_session_metadata() {
        let json = br#"[{"cwd":"/repos/breach","kind":"interactive","name":"Agent dashboard","pid":42,"sessionId":"session-1","startedAt":1234}]"#;
        assert_eq!(
            parse_claude_sessions(json),
            vec![ClaudeSession {
                cwd: "/repos/breach".into(),
                kind: "interactive".into(),
                name: "Agent dashboard".into(),
                pid: 42,
                session_id: "session-1".into(),
                started_at: 1234,
            }]
        );
        assert!(parse_claude_sessions(b"not json").is_empty());
    }

    #[test]
    fn parses_codex_attention_flags() {
        let status: CodexThreadStatus =
            serde_json::from_str(r#"{"type":"active","activeFlags":["waitingOnApproval"]}"#)
                .unwrap();
        assert_eq!(status.kind, "active");
        assert_eq!(status.active_flags, vec!["waitingOnApproval"]);
    }
}
