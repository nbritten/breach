import { Button } from "./Button";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "./Modal";
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
    <Modal
      title="Start an agent"
      subtitle={<p className="text-sm text-neutral-400">Launch Codex or Claude in a repository’s terminal.</p>}
      width="460px"
      onClose={onClose}
      closable={!starting}
      footer={
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            onClick={onClose}
            disabled={starting}
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={start}
            disabled={!repoPath || starting}
            variant="primary"
          >
            {starting ? "Starting…" : "Start agent"}
          </Button>
        </div>
      }
    >
      <label htmlFor="agent-provider" className="block text-xs font-medium text-neutral-400">
        Provider
      </label>
      <select
        id="agent-provider"
        disabled={starting}
        value={provider}
        onChange={(event) =>
          setProvider(event.currentTarget.value as AgentProvider)
        }
        className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-500"
      >
        <option value="codex">Codex</option>
        <option value="claude">Claude</option>
      </select>
      <label htmlFor="agent-repository" className="mt-4 block text-xs font-medium text-neutral-400">
        Repository
      </label>
      <select
        id="agent-repository"
        disabled={starting}
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
    </Modal>
  );
}
