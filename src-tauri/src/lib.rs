mod commands;
mod git;

fn raise_fd_limit() {
    // macOS ships with a very low soft NOFILE (256) while the hard limit is much higher.
    // Bump the soft to at least 4096 so parallel `git` spawns don't exhaust descriptors.
    let _ = rlimit::increase_nofile_limit(65536);
}

/// Replace the GUI-launch PATH with what the user's interactive login shell
/// sees. Finder-launched apps inherit a minimal PATH (`/usr/bin:/bin:...`),
/// which means `git`, `gh`, and anything from asdf/mise/nix/fnm/etc. fail to
/// resolve. Spawning the user's `$SHELL` with `-l -i` makes it source their
/// login + rc files, so the captured PATH matches what they get in Terminal.
///
/// Falls back to a small hardcoded Homebrew prepend if the probe fails — e.g.
/// the user has a broken `.zshrc` that exits non-zero, or `$SHELL` is unset.
fn augment_path() {
    if let Some(real_path) = path_from_login_shell() {
        std::env::set_var("PATH", real_path);
        return;
    }
    prepend_homebrew_paths();
}

fn path_from_login_shell() -> Option<String> {
    let shell = std::env::var("SHELL").ok()?;
    // `-l -i` makes the shell source both login (`.zprofile`, `.bash_profile`)
    // and interactive (`.zshrc`, `.bashrc`) configs. Most version managers
    // install their PATH hooks in the interactive rc file.
    //
    // stderr is discarded because interactive shells often print prompts /
    // MOTD / "you have mail" noise we don't want to ingest. stdout is just
    // PATH because `-c` is non-interactive enough that we don't get other
    // chatter on stdout.
    let output = std::process::Command::new(&shell)
        .args(["-l", "-i", "-c", "printf %s \"$PATH\""])
        .stderr(std::process::Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8(output.stdout).ok()?;
    let trimmed = path.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn prepend_homebrew_paths() {
    let current = std::env::var("PATH").unwrap_or_default();
    let existing: std::collections::HashSet<&str> = current.split(':').collect();
    let extras = ["/opt/homebrew/bin", "/usr/local/bin"];
    let prefix: Vec<&str> = extras
        .iter()
        .copied()
        .filter(|e| !existing.contains(e))
        .collect();
    if prefix.is_empty() {
        return;
    }
    let joined = if current.is_empty() {
        prefix.join(":")
    } else {
        format!("{}:{}", prefix.join(":"), current)
    };
    std::env::set_var("PATH", joined);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    raise_fd_limit();
    augment_path();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(commands::watcher::WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            commands::agents::list_active_claude_sessions,
            commands::repos::list_repos,
            commands::repos::repo_summary,
            commands::repos::repo_diff,
            commands::repos::repo_log,
            commands::repos::commit_diff,
            commands::repos::repo_dirty_files,
            commands::repos::repo_stash,
            commands::repos::repo_discard_all,
            commands::repos::default_repos_path,
            commands::repos::home_relative,
            commands::sync::sync_all,
            commands::sync::repo_sync_to_default,
            commands::gh::list_missing_repos,
            commands::gh::clone_repos,
            commands::gh::gh_login,
            commands::gh::list_my_prs,
            commands::gh::list_ci_status,
            commands::notifications::pr_notifications_changed,
            commands::shell::open_in_terminal,
            commands::shell::list_terminal_apps,
            commands::watcher::start_repos_watcher,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
