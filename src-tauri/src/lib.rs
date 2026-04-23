mod commands;
mod git;

fn raise_fd_limit() {
    // macOS ships with a very low soft NOFILE (256) while the hard limit is much higher.
    // Bump the soft to at least 4096 so parallel `git` spawns don't exhaust descriptors.
    let _ = rlimit::increase_nofile_limit(65536);
}

/// Prepend common macOS bin directories to PATH so `git`, `gh`, etc. are resolvable
/// when the app is launched from Finder (GUI launches inherit a minimal PATH that
/// doesn't include Homebrew). Existing entries are preserved and not duplicated.
fn augment_path() {
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
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::repos::list_repos,
            commands::repos::repo_summary,
            commands::repos::repo_diff,
            commands::repos::repo_log,
            commands::repos::commit_diff,
            commands::repos::repo_dirty_files,
            commands::repos::repo_stash,
            commands::repos::repo_discard_all,
            commands::repos::default_repos_path,
            commands::sync::sync_all,
            commands::sync::repo_sync_to_default,
            commands::prune::list_stale_branches,
            commands::prune::delete_branches,
            commands::gh::clone_missing,
            commands::gh::list_my_prs,
            commands::gh::list_ci_status,
            commands::shell::open_in_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
