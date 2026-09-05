import { useEffect, useRef, useState } from "react";
import { TerminalView } from "../components/TerminalView";
import {
  useTerminalSession,
  type TerminalWorkspaceSession,
} from "../lib/terminalSession";
import { useToast } from "../lib/toast";

export function Terminal() {
  const { sessions, activeId, activate, create, ensure, close, rename } =
    useTerminalSession();
  const { showError } = useToast();
  const active = sessions.find((session) => session.id === activeId) ?? null;

  useEffect(() => {
    void ensure().catch(showError);
  }, [ensure, showError]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        void create().catch(showError);
      } else if (event.key.toLowerCase() === "w" && activeId) {
        event.preventDefault();
        void close(activeId);
      } else if (/^[1-9]$/.test(event.key)) {
        const session = sessions[Number(event.key) - 1];
        if (session) {
          event.preventDefault();
          activate(session.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sessions, activeId, activate, close, create, showError]);

  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-neutral-800 px-6 py-3 flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Terminal</h1>
          <p className="text-xs text-neutral-500 font-mono truncate">
            {active?.cwd ?? "No active session"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void create().catch(showError)}
          className="ml-4 shrink-0 px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm"
        >
          New terminal
        </button>
      </header>
      <main className="flex-1 min-h-0">
        {active ? (
          <TerminalView key={active.id} sessionId={active.id} />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-neutral-500">
            No terminal sessions
          </div>
        )}
      </main>
      <TerminalTabs
        sessions={sessions}
        activeId={activeId}
        onActivate={activate}
        onClose={(id) => void close(id)}
        onCreate={() => void create().catch(showError)}
        onRename={rename}
      />
    </div>
  );
}

function TerminalTabs({
  sessions,
  activeId,
  onActivate,
  onClose,
  onCreate,
  onRename,
}: {
  sessions: TerminalWorkspaceSession[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  const beginRename = (session: TerminalWorkspaceSession) => {
    setEditingId(session.id);
    setDraft(session.title);
  };

  const finishRename = () => {
    if (editingId) onRename(editingId, draft);
    setEditingId(null);
  };

  return (
    <div className="shrink-0 h-10 border-t border-neutral-800 bg-neutral-900 flex items-stretch overflow-hidden">
      <div className="flex-1 flex overflow-x-auto">
        {sessions.map((session) => {
          const selected = session.id === activeId;
          return (
            <div
              key={session.id}
              className={`group shrink-0 min-w-32 max-w-56 border-r border-neutral-800 flex items-center ${
                selected ? "bg-neutral-950 text-neutral-100" : "text-neutral-500"
              }`}
            >
              <div className="min-w-0 flex-1 h-full flex items-center">
                <span
                  className={`ml-3 w-1.5 h-1.5 rounded-full shrink-0 ${
                    session.status === "running"
                      ? "bg-emerald-400"
                      : "bg-neutral-600"
                  }`}
                />
                {editingId === session.id ? (
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(event) => setDraft(event.currentTarget.value)}
                    onBlur={finishRename}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") setEditingId(null);
                    }}
                    onClick={(event) => event.stopPropagation()}
                    className="min-w-0 flex-1 mx-2 bg-neutral-800 rounded px-1 py-0.5 outline-none text-xs text-neutral-100"
                    aria-label="Terminal name"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onActivate(session.id)}
                    onDoubleClick={() => beginRename(session)}
                    className="min-w-0 flex-1 self-stretch px-2 text-left text-xs truncate"
                    title={`${session.title} — ${session.cwd}`}
                  >
                    {session.title}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => onClose(session.id)}
                aria-label={`Close ${session.title}`}
                className="w-7 h-full opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-neutral-100"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onCreate}
        title="New terminal (⌘T)"
        aria-label="New terminal"
        className="shrink-0 w-10 border-l border-neutral-800 text-neutral-500 hover:text-neutral-100 hover:bg-neutral-800"
      >
        +
      </button>
    </div>
  );
}
