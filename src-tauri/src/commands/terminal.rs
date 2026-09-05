use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, Weak};
use tauri::{AppHandle, Emitter, State};

const DEFAULT_COLS: u16 = 80;
const DEFAULT_ROWS: u16 = 24;
const READ_BUFFER_SIZE: usize = 8 * 1024;
const OUTPUT_EVENT: &str = "terminal-output";
const EXIT_EVENT: &str = "terminal-exit";

#[derive(Clone, Serialize)]
pub struct TerminalSessionInfo {
    id: String,
    cwd: String,
    pid: Option<u32>,
}

#[derive(Clone, Serialize)]
struct TerminalOutput {
    session_id: String,
    data: Vec<u8>,
}

#[derive(Clone, Serialize)]
struct TerminalExit {
    session_id: String,
    exit_code: u32,
    signal: Option<String>,
}

struct TerminalSession {
    info: TerminalSessionInfo,
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
}

impl Drop for TerminalSession {
    fn drop(&mut self) {
        if let Ok(killer) = self.killer.get_mut() {
            let _ = killer.kill();
        }
    }
}

type Sessions = Arc<Mutex<HashMap<String, Arc<TerminalSession>>>>;

#[derive(Clone)]
pub struct TerminalState {
    sessions: Sessions,
    next_id: Arc<AtomicU64>,
}

impl Default for TerminalState {
    fn default() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(AtomicU64::new(1)),
        }
    }
}

impl TerminalState {
    fn next_session_id(&self) -> String {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        format!("terminal-{id}")
    }

    pub fn kill_all(&self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.clear();
        }
    }
}

fn lock_error(name: &str) -> String {
    format!("terminal {name} lock is poisoned")
}

fn terminal_size(cols: u16, rows: u16) -> Result<PtySize, String> {
    if cols == 0 || rows == 0 {
        return Err("terminal rows and columns must be greater than zero".to_string());
    }
    Ok(PtySize {
        cols,
        rows,
        pixel_width: 0,
        pixel_height: 0,
    })
}

fn terminal_cwd(cwd: &str) -> Result<PathBuf, String> {
    let path = super::expand(cwd);
    if !path.is_dir() {
        return Err(format!(
            "terminal working directory does not exist: {}",
            path.display()
        ));
    }
    Ok(path)
}

fn user_shell() -> PathBuf {
    std::env::var_os("SHELL")
        .filter(|shell| !shell.is_empty())
        .map(PathBuf::from)
        .filter(|shell| shell.is_file())
        .unwrap_or_else(|| PathBuf::from("/bin/zsh"))
}

#[tauri::command]
pub fn terminal_spawn(
    app: AppHandle,
    state: State<'_, TerminalState>,
    cwd: String,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<TerminalSessionInfo, String> {
    let cwd = terminal_cwd(&cwd)?;
    let size = terminal_size(cols.unwrap_or(DEFAULT_COLS), rows.unwrap_or(DEFAULT_ROWS))?;
    let pair = native_pty_system()
        .openpty(size)
        .map_err(|error| format!("failed to open terminal: {error}"))?;

    let shell = user_shell();
    let mut command = CommandBuilder::new(&shell);
    command.arg("-l");
    command.cwd(&cwd);
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");

    let mut child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| format!("failed to start {}: {error}", shell.display()))?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| format!("failed to open terminal output: {error}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| format!("failed to open terminal input: {error}"))?;

    let id = state.next_session_id();
    let info = TerminalSessionInfo {
        id: id.clone(),
        cwd: cwd.to_string_lossy().into_owned(),
        pid: child.process_id(),
    };
    let session = Arc::new(TerminalSession {
        info: info.clone(),
        master: Mutex::new(pair.master),
        writer: Mutex::new(writer),
        killer: Mutex::new(child.clone_killer()),
    });
    state
        .sessions
        .lock()
        .map_err(|_| lock_error("session"))?
        .insert(id.clone(), session);

    let output_app = app.clone();
    let output_id = id.clone();
    let reader_thread = std::thread::spawn(move || {
        let mut buffer = [0_u8; READ_BUFFER_SIZE];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    let _ = output_app.emit(
                        OUTPUT_EVENT,
                        TerminalOutput {
                            session_id: output_id.clone(),
                            data: buffer[..read].to_vec(),
                        },
                    );
                }
            }
        }
    });

    let sessions: Weak<Mutex<HashMap<String, Arc<TerminalSession>>>> =
        Arc::downgrade(&state.sessions);
    std::thread::spawn(move || {
        let status = child.wait();
        let _ = reader_thread.join();
        if let Some(sessions) = sessions.upgrade() {
            if let Ok(mut sessions) = sessions.lock() {
                sessions.remove(&id);
            }
        }
        let (exit_code, signal) = status
            .map(|status| (status.exit_code(), status.signal().map(str::to_string)))
            .unwrap_or((1, None));
        let _ = app.emit(
            EXIT_EVENT,
            TerminalExit {
                session_id: id,
                exit_code,
                signal,
            },
        );
    });

    Ok(info)
}

#[tauri::command]
pub fn terminal_write(
    state: State<'_, TerminalState>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(|_| lock_error("session"))?
        .get(&session_id)
        .cloned()
        .ok_or_else(|| format!("unknown terminal session: {session_id}"))?;
    let mut writer = session.writer.lock().map_err(|_| lock_error("input"))?;
    writer
        .write_all(&data)
        .and_then(|_| writer.flush())
        .map_err(|error| format!("failed to write to terminal: {error}"))
}

#[tauri::command]
pub fn terminal_resize(
    state: State<'_, TerminalState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let size = terminal_size(cols, rows)?;
    let session = state
        .sessions
        .lock()
        .map_err(|_| lock_error("session"))?
        .get(&session_id)
        .cloned()
        .ok_or_else(|| format!("unknown terminal session: {session_id}"))?;
    let master = session.master.lock().map_err(|_| lock_error("PTY"))?;
    master
        .resize(size)
        .map_err(|error| format!("failed to resize terminal: {error}"))
}

#[tauri::command]
pub fn terminal_kill(state: State<'_, TerminalState>, session_id: String) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(|_| lock_error("session"))?
        .remove(&session_id)
        .ok_or_else(|| format!("unknown terminal session: {session_id}"))?;
    let mut killer = session.killer.lock().map_err(|_| lock_error("process"))?;
    killer
        .kill()
        .map_err(|error| format!("failed to stop terminal: {error}"))
}

#[tauri::command]
pub fn terminal_list(state: State<'_, TerminalState>) -> Result<Vec<TerminalSessionInfo>, String> {
    let sessions = state.sessions.lock().map_err(|_| lock_error("session"))?;
    let mut listed: Vec<_> = sessions
        .values()
        .map(|session| session.info.clone())
        .collect();
    listed.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(listed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn rejects_zero_terminal_dimensions() {
        assert!(terminal_size(0, 24).is_err());
        assert!(terminal_size(80, 0).is_err());
    }

    #[test]
    fn accepts_terminal_dimensions() {
        let size = terminal_size(120, 40).unwrap();
        assert_eq!(size.cols, 120);
        assert_eq!(size.rows, 40);
    }

    #[test]
    fn rejects_missing_working_directory() {
        assert!(terminal_cwd("/this/terminal/path/does/not/exist").is_err());
    }

    #[test]
    fn accepts_existing_working_directory() {
        assert_eq!(terminal_cwd("/tmp").unwrap(), Path::new("/tmp"));
    }

    #[test]
    fn creates_stable_opaque_session_ids() {
        let state = TerminalState::default();
        assert_eq!(state.next_session_id(), "terminal-1");
        assert_eq!(state.next_session_id(), "terminal-2");
    }

    #[test]
    fn pty_carries_process_output_and_reports_exit() {
        let pair = native_pty_system().openpty(PtySize::default()).unwrap();
        let mut command = CommandBuilder::new("/bin/sh");
        command.args(["-c", "printf breach-ready"]);
        let mut child = pair.slave.spawn_command(command).unwrap();
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().unwrap();
        let mut output = [0_u8; 64];
        let read = reader.read(&mut output).unwrap();
        let status = child.wait().unwrap();
        assert!(status.success());
        assert_eq!(&output[..read], b"breach-ready");
    }

    #[test]
    fn pty_resize_reaches_the_kernel() {
        let pair = native_pty_system().openpty(PtySize::default()).unwrap();
        let wanted = PtySize {
            cols: 132,
            rows: 48,
            pixel_width: 0,
            pixel_height: 0,
        };
        pair.master.resize(wanted).unwrap();
        assert_eq!(pair.master.get_size().unwrap(), wanted);
    }
}
