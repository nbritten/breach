use std::path::PathBuf;

fn ghostty_installed() -> bool {
    let candidates = [
        PathBuf::from("/Applications/Ghostty.app"),
        dirs::home_dir()
            .map(|h| h.join("Applications/Ghostty.app"))
            .unwrap_or_default(),
    ];
    candidates.iter().any(|p| p.exists())
}

/// Open a directory in a macOS terminal. Prefers Ghostty when installed, otherwise
/// falls back to Terminal.app. Returns the name of the app that was launched.
#[tauri::command]
pub async fn open_in_terminal(repo_path: String) -> Result<String, String> {
    let path = PathBuf::from(&repo_path);
    let app = if ghostty_installed() { "Ghostty" } else { "Terminal" };
    let output = tokio::process::Command::new("open")
        .arg("-a")
        .arg(app)
        .arg(&path)
        .output()
        .await
        .map_err(|e| format!("failed to spawn open: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(app.to_string())
}
