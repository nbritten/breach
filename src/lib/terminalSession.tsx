import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getReposPath } from "./settings";
import {
  resizeTerminal,
  spawnTerminal,
  writeTerminal,
  type TerminalExitEvent,
  type TerminalOutputEvent,
  type TerminalSessionInfo,
} from "./terminal";

const MAX_REPLAY_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();

type SessionStatus = "idle" | "starting" | "running" | "exited" | "failed";
type OutputListener = (data: Uint8Array) => void;

type BufferedOutput = {
  chunks: Uint8Array[];
  bytes: number;
};

type TerminalSessionContextValue = {
  session: TerminalSessionInfo | null;
  status: SessionStatus;
  start: (cols: number, rows: number) => Promise<TerminalSessionInfo>;
  write: (sessionId: string, data: Uint8Array) => Promise<void>;
  resize: (sessionId: string, cols: number, rows: number) => Promise<void>;
  subscribe: (sessionId: string, listener: OutputListener) => () => void;
};

const TerminalSessionContext = createContext<TerminalSessionContextValue | null>(
  null,
);

function appendOutput(buffer: BufferedOutput, data: Uint8Array) {
  buffer.chunks.push(data);
  buffer.bytes += data.byteLength;
  while (buffer.bytes > MAX_REPLAY_BYTES && buffer.chunks.length > 1) {
    const removed = buffer.chunks.shift();
    if (removed) buffer.bytes -= removed.byteLength;
  }
}

export function TerminalSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<TerminalSessionInfo | null>(null);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const sessionRef = useRef<TerminalSessionInfo | null>(null);
  const startPromiseRef = useRef<Promise<TerminalSessionInfo> | null>(null);
  const buffersRef = useRef(new Map<string, BufferedOutput>());
  const listenersRef = useRef(new Map<string, Set<OutputListener>>());
  const eventListenersRef = useRef<UnlistenFn[]>([]);
  const eventListenersReadyRef = useRef<Promise<void> | null>(null);
  const disposedRef = useRef(false);

  const publish = useCallback((sessionId: string, data: Uint8Array) => {
    let buffer = buffersRef.current.get(sessionId);
    if (!buffer) {
      buffer = { chunks: [], bytes: 0 };
      buffersRef.current.set(sessionId, buffer);
    }
    appendOutput(buffer, data);
    for (const listener of listenersRef.current.get(sessionId) ?? []) {
      listener(data);
    }
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
        publish(
          payload.session_id,
          encoder.encode(`\r\n\x1b[2m[Process ${suffix}]\x1b[0m\r\n`),
        );
        if (sessionRef.current?.id === payload.session_id) {
          setStatus("exited");
        }
      }),
    ]).then((registered) => {
      if (disposedRef.current) registered.forEach((unlisten) => unlisten());
      else eventListenersRef.current.push(...registered);
    });
    eventListenersReadyRef.current = pending;
    return pending;
  }, [publish]);

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

  const start = useCallback((cols: number, rows: number) => {
    if (sessionRef.current) return Promise.resolve(sessionRef.current);
    if (startPromiseRef.current) return startPromiseRef.current;

    setStatus("starting");
    const pending = ensureEventListeners()
      .then(getReposPath)
      .then((cwd) => spawnTerminal(cwd, cols, rows))
      .then((started) => {
        sessionRef.current = started;
        setSession(started);
        setStatus("running");
        return started;
      })
      .catch((error) => {
        setStatus("failed");
        throw error;
      })
      .finally(() => {
        startPromiseRef.current = null;
      });
    startPromiseRef.current = pending;
    return pending;
  }, [ensureEventListeners]);

  const subscribe = useCallback(
    (sessionId: string, listener: OutputListener) => {
      for (const chunk of buffersRef.current.get(sessionId)?.chunks ?? []) {
        listener(chunk);
      }
      let listeners = listenersRef.current.get(sessionId);
      if (!listeners) {
        listeners = new Set();
        listenersRef.current.set(sessionId, listeners);
      }
      listeners.add(listener);
      return () => {
        listeners?.delete(listener);
        if (listeners?.size === 0) listenersRef.current.delete(sessionId);
      };
    },
    [],
  );

  const value = useMemo<TerminalSessionContextValue>(
    () => ({
      session,
      status,
      start,
      subscribe,
      write: writeTerminal,
      resize: resizeTerminal,
    }),
    [session, start, status, subscribe],
  );

  return (
    <TerminalSessionContext.Provider value={value}>
      {children}
    </TerminalSessionContext.Provider>
  );
}

export function useTerminalSession() {
  const value = useContext(TerminalSessionContext);
  if (!value) {
    throw new Error("useTerminalSession must be used inside TerminalSessionProvider");
  }
  return value;
}
