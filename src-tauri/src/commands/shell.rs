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

/// Built-in macOS terminal we always fall back to — guaranteed present on any
/// macOS install, so we don't list it in `KNOWN_TERMINALS` (which is for
/// detection) and don't try to validate that it exists.
const FALLBACK_TERMINAL: &str = "Terminal";

fn app_installed(bundle: &str) -> bool {
    let candidates = [
        PathBuf::from("/Applications").join(bundle),
        dirs::home_dir()
            .map(|h| h.join("Applications").join(bundle))
            .unwrap_or_default(),
    ];
    candidates.iter().any(|p| p.exists())
}

/// First installed app from `KNOWN_TERMINALS` (in list order), or `Terminal` as
/// the universal fallback. The list order doubles as the auto-detect preference,
/// so reordering it changes which terminal a zero-config user gets.
fn auto_detect_terminal() -> &'static str {
    auto_detect_with(|bundle| app_installed(bundle))
}

/// Pure variant of `auto_detect_terminal` parameterized on the install check, so
/// the preference order can be unit-tested without touching the filesystem.
fn auto_detect_with(installed: impl Fn(&str) -> bool) -> &'static str {
    for (name, bundle) in KNOWN_TERMINALS {
        if installed(bundle) {
            return name;
        }
    }
    FALLBACK_TERMINAL
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
    found.push(FALLBACK_TERMINAL.to_string());
    found
}

/// Open a directory in a macOS terminal. Uses `app` when non-empty; otherwise
/// auto-detects the first installed terminal from the known set, falling back
/// to Terminal. Returns the name of the app that was launched.
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
        .unwrap_or_else(|| auto_detect_terminal().to_string());
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn installed(bundles: &[&str]) -> impl Fn(&str) -> bool {
        let set: HashSet<String> = bundles.iter().map(|s| (*s).to_string()).collect();
        move |bundle| set.contains(bundle)
    }

    #[test]
    fn falls_back_to_terminal_when_nothing_known_is_installed() {
        assert_eq!(auto_detect_with(installed(&[])), FALLBACK_TERMINAL);
    }

    #[test]
    fn picks_ghostty_when_only_ghostty_is_installed() {
        assert_eq!(auto_detect_with(installed(&["Ghostty.app"])), "Ghostty");
    }

    #[test]
    fn ghostty_wins_over_iterm_when_both_installed() {
        // Locks in the preference order: a future contributor alphabetizing the
        // list would change which terminal multi-terminal users get.
        assert_eq!(
            auto_detect_with(installed(&["Ghostty.app", "iTerm.app"])),
            "Ghostty",
        );
    }

    #[test]
    fn picks_iterm_when_ghostty_absent() {
        assert_eq!(auto_detect_with(installed(&["iTerm.app"])), "iTerm");
    }

    #[test]
    fn falls_through_to_first_installed_in_list_order() {
        // Warp comes after Ghostty / iTerm in KNOWN_TERMINALS; with those absent
        // it should win over later entries even though they're also installed.
        assert_eq!(
            auto_detect_with(installed(&["Warp.app", "Tabby.app"])),
            "Warp",
        );
    }

    #[test]
    fn unknown_bundle_doesnt_match() {
        // Defensive: only the bundle names in KNOWN_TERMINALS are consulted —
        // an installed app we don't know about doesn't accidentally win.
        assert_eq!(
            auto_detect_with(installed(&["SomeOtherTerm.app"])),
            FALLBACK_TERMINAL,
        );
    }
}
