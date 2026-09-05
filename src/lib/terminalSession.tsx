import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getReposPath } from "./settings";
import {
  killTerminal, resizeTerminal, spawnTerminal, writeTerminal,
  type TerminalExitEvent, type TerminalOutputEvent, type TerminalSessionInfo,
} from "./terminal";

const MAX_REPLAY_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();

export type SessionStatus = "running" | "exited" | "failed";
export type TerminalWorkspaceSession = TerminalSessionInfo & {
  title: string;
  status: SessionStatus;
};
type OutputListener = (data: Uint8Array) => void;
type BufferedOutput = { chunks: Uint8Array[]; bytes: number };

type TerminalSessionContextValue = {
  sessions: TerminalWorkspaceSession[];
  activeId: string | null;
  activate: (id: string) => void;
  create: (cwd?: string, cols?: number, rows?: number) => Promise<TerminalWorkspaceSession>;
  ensure: (cols?: number, rows?: number) => Promise<TerminalWorkspaceSession>;
  close: (id: string) => Promise<void>;
  rename: (id: string, title: string) => void;
  write: typeof writeTerminal;
  resize: typeof resizeTerminal;
  subscribe: (id: string, listener: OutputListener) => () => void;
};

const TerminalSessionContext = createContext<TerminalSessionContextValue | null>(null);

function defaultTitle(cwd: string) {
  const trimmed = cwd.replace(/\/+$/, "");
  return trimmed.split("/").pop() || cwd;
}

function appendOutput(buffer: BufferedOutput, data: Uint8Array) {
  buffer.chunks.push(data);
  buffer.bytes += data.byteLength;
  while (buffer.bytes > MAX_REPLAY_BYTES && buffer.chunks.length > 1) {
    const removed = buffer.chunks.shift();
    if (removed) buffer.bytes -= removed.byteLength;
  }
}

export function TerminalSessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<TerminalWorkspaceSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sessionsRef = useRef<TerminalWorkspaceSession[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const ensurePromiseRef = useRef<Promise<TerminalWorkspaceSession> | null>(null);
  const buffersRef = useRef(new Map<string, BufferedOutput>());
  const closedIdsRef = useRef(new Set<string>());
  const outputListenersRef = useRef(new Map<string, Set<OutputListener>>());
  const eventListenersRef = useRef<UnlistenFn[]>([]);
  const eventListenersReadyRef = useRef<Promise<void> | null>(null);
  const disposedRef = useRef(false);

  const replaceSessions = useCallback((update: (current: TerminalWorkspaceSession[]) => TerminalWorkspaceSession[]) => {
    const next = update(sessionsRef.current);
    sessionsRef.current = next;
    setSessions(next);
    return next;
  }, []);

  const activate = useCallback((id: string) => {
    if (!sessionsRef.current.some((session) => session.id === id)) return;
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  const publish = useCallback((id: string, data: Uint8Array) => {
    if (closedIdsRef.current.has(id)) return;
    let buffer = buffersRef.current.get(id);
    if (!buffer) {
      buffer = { chunks: [], bytes: 0 };
      buffersRef.current.set(id, buffer);
    }
    appendOutput(buffer, data);
    for (const listener of outputListenersRef.current.get(id) ?? []) listener(data);
  }, []);

  const ensureEventListeners = useCallback(() => {
    if (eventListenersReadyRef.current) return eventListenersReadyRef.current;
    const pending = Promise.all([
      listen<TerminalOutputEvent>("terminal-output", ({ payload }) => {
        publish(payload.session_id, Uint8Array.from(payload.data));
      }),
      listen<TerminalExitEvent>("terminal-exit", ({ payload }) => {
        const suffix = payload.signal
          ? `terminated by ${payload.signal}`
          : `exited with code ${payload.exit_code}`;
        publish(payload.session_id, encoder.encode(`\r\n\x1b[2m[Process ${suffix}]\x1b[0m\r\n`));
        replaceSessions((current) => current.map((session) =>
          session.id === payload.session_id ? { ...session, status: "exited" } : session,
        ));
      }),
    ]).then((registered) => {
      if (disposedRef.current) registered.forEach((unlisten) => unlisten());
      else eventListenersRef.current.push(...registered);
    });
    eventListenersReadyRef.current = pending;
    return pending;
  }, [publish, replaceSessions]);

  useEffect(() => {
    disposedRef.current = false;
    void ensureEventListeners();
    return () => {
      disposedRef.current = true;
      eventListenersRef.current.forEach((unlisten) => unlisten());
      eventListenersRef.current = [];
      eventListenersReadyRef.current = null;
    };
  }, [ensureEventListeners]);

  const create = useCallback(async (cwd?: string, cols = 80, rows = 24) => {
    await ensureEventListeners();
    const started = await spawnTerminal(cwd ?? await getReposPath(), cols, rows);
    const session: TerminalWorkspaceSession = {
      ...started,
      title: defaultTitle(started.cwd),
      status: "running",
    };
    replaceSessions((current) => [...current, session]);
    activeIdRef.current = session.id;
    setActiveId(session.id);
    return session;
  }, [ensureEventListeners, replaceSessions]);

  const ensure = useCallback((cols = 80, rows = 24) => {
    const active = sessionsRef.current.find((session) => session.id === activeIdRef.current);
    if (active) return Promise.resolve(active);
    const first = sessionsRef.current[0];
    if (first) {
      activate(first.id);
      return Promise.resolve(first);
    }
    if (!ensurePromiseRef.current) {
      ensurePromiseRef.current = create(undefined, cols, rows).finally(() => {
        ensurePromiseRef.current = null;
      });
    }
    return ensurePromiseRef.current;
  }, [activate, create]);

  const close = useCallback(async (id: string) => {
    const index = sessionsRef.current.findIndex((session) => session.id === id);
    if (index === -1) return;
    const closing = sessionsRef.current[index];
    if (closing.status === "running") await killTerminal(id).catch(() => {});
    const remaining = sessionsRef.current.filter((session) => session.id !== id);
    closedIdsRef.current.add(id);
    sessionsRef.current = remaining;
    setSessions(remaining);
    buffersRef.current.delete(id);
    outputListenersRef.current.delete(id);
    if (activeIdRef.current === id) {
      const next = remaining[Math.min(index, remaining.length - 1)]?.id ?? null;
      activeIdRef.current = next;
      setActiveId(next);
    }
  }, []);

  const rename = useCallback((id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    replaceSessions((current) => current.map((session) =>
      session.id === id ? { ...session, title: trimmed } : session,
    ));
  }, [replaceSessions]);

  const subscribe = useCallback((id: string, listener: OutputListener) => {
    for (const chunk of buffersRef.current.get(id)?.chunks ?? []) listener(chunk);
    let listeners = outputListenersRef.current.get(id);
    if (!listeners) {
      listeners = new Set();
      outputListenersRef.current.set(id, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) outputListenersRef.current.delete(id);
    };
  }, []);

  const value = useMemo<TerminalSessionContextValue>(() => ({
    sessions, activeId, activate, create, ensure, close, rename, subscribe,
    write: writeTerminal,
    resize: resizeTerminal,
  }), [sessions, activeId, activate, create, ensure, close, rename, subscribe]);

  return <TerminalSessionContext.Provider value={value}>{children}</TerminalSessionContext.Provider>;
}

export function useTerminalSession() {
  const value = useContext(TerminalSessionContext);
  if (!value) throw new Error("useTerminalSession must be used inside TerminalSessionProvider");
  return value;
}
