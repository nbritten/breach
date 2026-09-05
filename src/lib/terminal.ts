import { invoke } from "@tauri-apps/api/core";

export type TerminalSessionInfo = {
  id: string;
  cwd: string;
  pid: number | null;
};

export type TerminalOutputEvent = {
  session_id: string;
  data: number[];
};

export type TerminalExitEvent = {
  session_id: string;
  exit_code: number;
  signal: string | null;
};

export function spawnTerminal(
  cwd: string,
  cols: number,
  rows: number,
): Promise<TerminalSessionInfo> {
  return invoke("terminal_spawn", { cwd, cols, rows });
}

export function writeTerminal(
  sessionId: string,
  data: Uint8Array,
): Promise<void> {
  return invoke("terminal_write", {
    sessionId,
    data: Array.from(data),
  });
}

export function resizeTerminal(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke("terminal_resize", { sessionId, cols, rows });
}

export function killTerminal(sessionId: string): Promise<void> {
  return invoke("terminal_kill", { sessionId });
}

export function listTerminals(): Promise<TerminalSessionInfo[]> {
  return invoke("terminal_list");
}
