use serde::Serialize;
use tokio::process::Command;

#[derive(Serialize)]
pub struct NotificationPoll {
    pub changed: bool,
    pub last_modified: Option<String>,
}

async fn gh_token() -> Result<String, String> {
    let out = Command::new("gh")
        .args(["auth", "token"])
        .output()
        .await
        .map_err(|e| format!("gh spawn failed: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    let token = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if token.is_empty() {
        return Err("gh auth token returned empty token".into());
    }
    Ok(token)
}

/// Poll GitHub's notifications endpoint with a conditional GET. A 304 means nothing
/// has changed since `last_modified` and costs no rate-limit budget; a 200 means the
/// stream changed and the caller should re-fetch the PR list.
///
/// `participating=true` scopes notifications to ones the user is directly involved in
/// (review requests, mentions, threads they posted in) — a noisy global feed would
/// trigger needless re-fetches.
#[tauri::command]
pub async fn pr_notifications_changed(
    last_modified: Option<String>,
) -> Result<NotificationPoll, String> {
    let token = gh_token().await?;

    let mut args: Vec<String> = vec![
        "-sS".into(),
        "-i".into(),
        "--max-redirs".into(),
        "0".into(),
        "-H".into(),
        format!("Authorization: token {token}"),
        "-H".into(),
        "Accept: application/vnd.github+json".into(),
    ];
    if let Some(ref lm) = last_modified {
        args.push("-H".into());
        args.push(format!("If-Modified-Since: {lm}"));
    }
    args.push("https://api.github.com/notifications?participating=true&all=false".into());

    let out = Command::new("curl")
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("curl spawn failed: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }

    parse_response(&String::from_utf8_lossy(&out.stdout), last_modified.as_deref())
}

fn parse_response(raw: &str, prev_lm: Option<&str>) -> Result<NotificationPoll, String> {
    // curl -i may emit multiple header blocks (interim 1xx, redirects) before the
    // final response. Each block ends in a blank line; the body follows the last
    // header block. Split on blank lines and take the second-to-last segment.
    let normalized = raw.replace("\r\n", "\n");
    let parts: Vec<&str> = normalized.split("\n\n").collect();
    if parts.len() < 2 {
        return Err("no header/body separator in response".into());
    }
    let header_block = parts[parts.len() - 2];

    let mut status: Option<u16> = None;
    let mut new_lm: Option<String> = None;
    for line in header_block.lines() {
        if line.starts_with("HTTP/") {
            status = line.split_whitespace().nth(1).and_then(|s| s.parse().ok());
        } else if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case("last-modified") {
                new_lm = Some(v.trim().to_string());
            }
        }
    }

    let code = status.ok_or_else(|| "no HTTP status line in response".to_string())?;
    let last_modified = new_lm.or_else(|| prev_lm.map(str::to_string));

    match code {
        200 => Ok(NotificationPoll { changed: true, last_modified }),
        304 => Ok(NotificationPoll { changed: false, last_modified }),
        _ => Err(format!("HTTP {code}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_200_extracts_last_modified() {
        let raw = "HTTP/2 200\r\n\
            content-type: application/json\r\n\
            last-modified: Sun, 26 Apr 2026 18:00:00 GMT\r\n\
            \r\n\
            [{\"id\":\"1\"}]";
        let res = parse_response(raw, None).unwrap();
        assert!(res.changed);
        assert_eq!(
            res.last_modified.as_deref(),
            Some("Sun, 26 Apr 2026 18:00:00 GMT"),
        );
    }

    #[test]
    fn parse_304_marks_unchanged_and_falls_back_to_prev_lm() {
        let raw = "HTTP/2 304\r\n\r\n";
        let res = parse_response(raw, Some("Sun, 26 Apr 2026 18:00:00 GMT")).unwrap();
        assert!(!res.changed);
        assert_eq!(
            res.last_modified.as_deref(),
            Some("Sun, 26 Apr 2026 18:00:00 GMT"),
        );
    }

    #[test]
    fn parse_uses_last_status_when_redirects_present() {
        // Defensive — we set --max-redirs 0, but if a proxy ever returns a 100 Continue
        // followed by 200, we should pick the final code.
        let raw = "HTTP/2 100\r\n\r\nHTTP/2 200\r\nlast-modified: x\r\n\r\n";
        let res = parse_response(raw, None).unwrap();
        assert!(res.changed);
    }

    #[test]
    fn parse_unexpected_status_is_error() {
        let raw = "HTTP/2 401\r\n\r\n";
        assert!(parse_response(raw, None).is_err());
    }

    #[test]
    fn parse_missing_status_is_error() {
        assert!(parse_response("", None).is_err());
    }
}
