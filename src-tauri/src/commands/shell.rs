use std::path::PathBuf;

/// Common macOS terminal emulators we surface as autocomplete suggestions in
/// Settings. The first column is what gets passed to `open -a`; the second is
/// the bundle name on disk. Anything not on this list still works — the user
/// can type any app name in Settings — this just powers the picker hints.
const KNOWN_TERMINALS: &[(&str, &str)] = &[
    ("Ghostty", "Ghostty.app"),
    ("iTerm", "iTerm.app"),
    ("Warp", "Warp.app"),
    ("Alacritty", "Alacritty.app"),
    ("kitty", "kitty.app"),
    ("WezTerm", "WezTerm.app"),
    ("Hyper", "Hyper.app"),
    ("Tabby", "Tabby.app"),
];

fn app_installed(bundle: &str) -> bool {
    let candidates = [
        PathBuf::from("/Applications").join(bundle),
        dirs::home_dir()
            .map(|h| h.join("Applications").join(bundle))
            .unwrap_or_default(),
    ];
    candidates.iter().any(|p| p.exists())
}

fn ghostty_installed() -> bool {
    app_installed("Ghostty.app")
}

/// List installed terminal apps from the known set, plus the always-present
/// `Terminal`. The frontend uses this to populate autocomplete suggestions in
/// the Settings picker; users can also type any other name they like.
#[tauri::command]
pub fn list_terminal_apps() -> Vec<String> {
    let mut found: Vec<String> = KNOWN_TERMINALS
        .iter()
        .filter(|(_, bundle)| app_installed(bundle))
        .map(|(name, _)| (*name).to_string())
        .collect();
    found.push("Terminal".to_string());
    found
}

/// Open a directory in a macOS terminal. Uses `app` when non-empty; otherwise
/// auto-detects (Ghostty if installed, else Terminal). Returns the name of the
/// app that was launched.
#[tauri::command]
pub async fn open_in_terminal(
    repo_path: String,
    app: Option<String>,
) -> Result<String, String> {
    let path = PathBuf::from(&repo_path);
    let chosen = app
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| {
            if ghostty_installed() {
                "Ghostty".to_string()
            } else {
                "Terminal".to_string()
            }
        });
    let output = tokio::process::Command::new("open")
        .arg("-a")
        .arg(&chosen)
        .arg(&path)
        .output()
        .await
        .map_err(|e| format!("failed to spawn open: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(chosen)
}
