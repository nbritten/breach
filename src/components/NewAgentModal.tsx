import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEscapeKey } from "../lib/hooks";
import { useTerminalSession } from "../lib/terminalSession";
import { useToast } from "../lib/toast";
import type { AgentProvider, RepoSummary } from "../types";

const encoder = new TextEncoder();

export function NewAgentModal({
  repos,
  onClose,
}: {
  repos: RepoSummary[];
  onClose: () => void;
}) {
  const [provider, setProvider] = useState<AgentProvider>("codex");
  const [repoPath, setRepoPath] = useState(repos[0]?.path ?? "");
  const [starting, setStarting] = useState(false);
  const terminal = useTerminalSession();
  const navigate = useNavigate();
  const { showError } = useToast();
  useEscapeKey(onClose, !starting);

  const start = async () => {
    if (!repoPath || starting) return;
    setStarting(true);
    try {
      const session = await terminal.create(repoPath);
      terminal.rename(
        session.id,
        `${provider} · ${repos.find((repo) => repo.path === repoPath)?.name ?? "agent"}`,
      );
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      await terminal.write(session.id, encoder.encode(`${provider}\r`));
      navigate("/terminal");
      onClose();
    } catch (error) {
      showError(error);
      setStarting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(event) =>
        event.target === event.currentTarget && !starting && onClose()
      }
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-agent-title"
        className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
      >
        <h2 id="new-agent-title" className="font-semibold">
          Start an agent
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Launch a provider in a repository-backed Breach terminal.
        </p>
        <label className="mt-5 block text-xs font-medium text-neutral-400">
          Provider
        </label>
        <select
          value={provider}
          onChange={(event) =>
            setProvider(event.currentTarget.value as AgentProvider)
          }
          className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        >
          <option value="codex">Codex</option>
          <option value="claude">Claude</option>
        </select>
        <label className="mt-4 block text-xs font-medium text-neutral-400">
          Repository
        </label>
        <select
          value={repoPath}
          onChange={(event) => setRepoPath(event.currentTarget.value)}
          className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        >
          {repos.map((repo) => (
            <option key={repo.path} value={repo.path}>
              {repo.name}
            </option>
          ))}
        </select>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={starting}
            className="rounded-md px-3 py-2 text-sm text-neutral-400 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={start}
            disabled={!repoPath || starting}
            className="rounded-md bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-white disabled:opacity-50"
          >
            {starting ? "Starting…" : "Start agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
