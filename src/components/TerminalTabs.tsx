import { useEffect, useRef, useState } from "react";
import type { TerminalWorkspaceSession } from "../lib/terminalSession";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { Tooltip } from "./Tooltip";

export function TerminalTabs({ sessions, activeId, onActivate, onClose, onCreate, onRename, creating = false }: {
  sessions: TerminalWorkspaceSession[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  creating?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    const selected = strip.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    selected?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    if (moveFocus.current && !editingId) { selected?.focus(); moveFocus.current = false; }
    if (editingId) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [activeId, editingId, sessions.length]);

  const beginRename = (session: TerminalWorkspaceSession) => {
    onActivate(session.id);
    cancelled.current = false;
    setDraft(session.title);
    setEditingId(session.id);
  };
  const finishRename = () => {
    const title = draft.trim();
    if (!cancelled.current && editingId && title) onRename(editingId, title);
    moveFocus.current = true;
    setEditingId(null);
  };

  return (
    <div className="terminal-tabbar">
      <div ref={strip} role="tablist" aria-label="Terminal sessions" className="terminal-tabs">
        {sessions.map((session, index) => {
          const selected = session.id === activeId;
          return (
            <div key={session.id} className={`terminal-tab ${selected ? "is-active" : ""}`} role="presentation">
              {editingId === session.id ? (
                <input
                  ref={inputRef} value={draft} onChange={(event) => setDraft(event.currentTarget.value)}
                  onBlur={finishRename} aria-label="Terminal name" className="terminal-tab-input"
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
                    if (event.key === "Escape") { event.preventDefault(); cancelled.current = true; finishRename(); }
                  }}
                />
              ) : (
                <button
                  type="button" role="tab" id={`terminal-tab-${session.id}`} aria-selected={selected}
                  aria-controls={selected ? "terminal-panel" : undefined}
                  tabIndex={selected || (!activeId && index === 0) ? 0 : -1}
                  className="terminal-tab-select"
                  title={`${session.cwd} · ${session.status === "running" ? "Running" : session.status === "failed" ? "Failed" : "Exited"} · Double-click or press F2 to rename`}
                  onClick={() => onActivate(session.id)} onDoubleClick={() => beginRename(session)}
                  onKeyDown={(event) => {
                    let next: number | undefined;
                    if (event.key === "ArrowRight") next = (index + 1) % sessions.length;
                    if (event.key === "ArrowLeft") next = (index - 1 + sessions.length) % sessions.length;
                    if (event.key === "Home") next = 0;
                    if (event.key === "End") next = sessions.length - 1;
                    if (next !== undefined) { event.preventDefault(); moveFocus.current = true; onActivate(sessions[next].id); }
                    if (event.key === "F2") { event.preventDefault(); beginRename(session); }
                    if (event.key === "Delete") { event.preventDefault(); moveFocus.current = true; onClose(session.id); }
                  }}
                >
                  <Icon name="terminal" />
                  <span className="truncate">{session.title}</span>
                  {session.status !== "running" && <span className={`terminal-tab-state ${session.status === "failed" ? "text-rose-300" : ""}`}>{session.status === "failed" ? "Failed" : "Exited"}</span>}
                </button>
              )}
              <button type="button" className="terminal-tab-close" aria-label={`Close ${session.title}`} title={`Close ${session.title}`} onClick={() => { moveFocus.current = true; onClose(session.id); }}>
                <Icon name="close" width="13" height="13" />
              </button>
            </div>
          );
        })}
      </div>
      <Tooltip content="New terminal · ⌘T" side="top" width="w-48">
        <Button variant="ghost" iconOnly aria-label="New terminal" disabled={creating} aria-busy={creating} onClick={onCreate}><Icon name={creating ? "refresh" : "plus"} className={creating ? "animate-spin" : ""} /></Button>
      </Tooltip>
    </div>
  );
}
