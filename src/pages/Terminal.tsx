import { TerminalTabs } from "../components/TerminalTabs";
import { useActionFeedback } from "../lib/useActionFeedback";
import { TerminalLaunchButton } from "../components/TerminalLaunchButton";
import { Icon } from "../components/Icon";
import { Button } from "../components/Button";
import { useEffect } from "react";
import { TerminalView } from "../components/TerminalView";
import {
  useTerminalSession,
} from "../lib/terminalSession";
import { useToast } from "../lib/toast";

export function Terminal() {
  const { sessions, activeId, activate, create, ensure, close, rename } =
    useTerminalSession();
  const { showError } = useToast();
  const { state: createState, run: createTerminal } = useActionFeedback(() => create(), showError);
  const active = sessions.find((session) => session.id === activeId) ?? null;

  useEffect(() => {
    void ensure().catch(showError);
  }, [ensure, showError]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, [contenteditable=true]")) return;
      if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        void createTerminal();
      } else if (event.key.toLowerCase() === "w" && activeId) {
        event.preventDefault();
        void close(activeId).catch(showError);
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
  }, [sessions, activeId, activate, close, createTerminal, showError]);

  return (
    <div className="h-full flex flex-col">
      <header className="page-header border-b border-neutral-800 flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Terminal</h1>
          <p className="text-xs text-neutral-500 font-mono truncate">
            {active?.cwd ?? "No active session"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TerminalLaunchButton path={active?.cwd ?? ""} external />
          <Button onClick={() => void createTerminal()} disabled={createState === "pending"} aria-busy={createState === "pending"}>
            <Icon name="plus" /> New terminal
          </Button>
        </div>
      </header>
      <main id="terminal-panel" role="tabpanel" aria-labelledby={active ? `terminal-tab-${active.id}` : undefined} className="flex-1 min-h-0">
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
        onClose={(id) => void close(id).catch(showError)}
        onCreate={() => void createTerminal()}
        creating={createState === "pending"}
        onRename={rename}
      />
    </div>
  );
}
