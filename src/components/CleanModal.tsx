import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { DirtyFile } from "../types";
import { errorText } from "../lib/errors";
import { Modal } from "./Modal";

interface Props {
  repoPath: string;
  repoName: string;
  onClose: () => void;
  onDone: () => void;
}

function statusLabel(f: DirtyFile): string {
  return (f.index_status || " ") + (f.work_status || " ");
}

function statusColor(f: DirtyFile): string {
  if (f.index_status === "?") return "text-neutral-500";
  if (f.index_status === "A" || f.work_status === "A") return "text-emerald-400";
  if (f.index_status === "D" || f.work_status === "D") return "text-rose-400";
  return "text-amber-400";
}

export function CleanModal({ repoPath, repoName, onClose, onDone }: Props) {
  const [files, setFiles] = useState<DirtyFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "confirm-discard" | "working">("idle");
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    api
      .repoDirtyFiles(repoPath)
      .then(setFiles)
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  }, [repoPath]);

  const doStash = async () => {
    setMode("working");
    setError(null);
    try {
      await api.repoStash(repoPath);
      onDone();
    } catch (e) {
      setError(errorText(e));
      setMode("idle");
    }
  };

  const doDiscard = async () => {
    setMode("working");
    setError(null);
    try {
      await api.repoDiscardAll(repoPath);
      onDone();
    } catch (e) {
      setError(errorText(e));
      setMode("confirm-discard");
    }
  };

  const canDiscard = confirmText.trim() === repoName;
  const untrackedCount = files.filter((f) => f.index_status === "?").length;
  const changedCount = files.length - untrackedCount;
  const hasFiles = files.length > 0;

  const footer =
    mode === "confirm-discard" ? (
      <div className="space-y-3">
        <div className="text-sm text-amber-300">
          ⚠ This will <b>permanently</b> delete untracked files and discard
          unstaged changes. Tracked commits are kept in the reflog, but
          untracked files are gone.
        </div>
        <div className="text-xs text-neutral-400">
          Type <code className="text-neutral-200">{repoName}</code> to confirm.
        </div>
        <input
          autoFocus
          value={confirmText}
          onChange={(e) => setConfirmText(e.currentTarget.value)}
          className="w-full px-3 py-1.5 rounded bg-neutral-950 border border-neutral-700 font-mono text-sm focus:outline-none focus:border-rose-500"
        />
        {error && <div className="text-rose-400 text-xs">{error}</div>}
        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              setMode("idle");
              setConfirmText("");
              setError(null);
            }}
            className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
          >
            ← Back
          </button>
          <button
            onClick={doDiscard}
            disabled={!canDiscard}
            className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:cursor-not-allowed text-sm text-white font-medium"
          >
            Discard permanently
          </button>
        </div>
      </div>
    ) : (
      <>
        {error && <div className="text-rose-400 text-xs mb-2">{error}</div>}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={mode === "working"}
            className="px-3 py-1.5 rounded hover:bg-neutral-800 text-sm text-neutral-400 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => setMode("confirm-discard")}
            disabled={!hasFiles || mode === "working"}
            className="px-3 py-1.5 rounded bg-rose-950 border border-rose-900 text-rose-300 hover:bg-rose-900 disabled:opacity-30 disabled:cursor-not-allowed text-sm"
          >
            Discard all…
          </button>
          <button
            onClick={doStash}
            disabled={!hasFiles || mode === "working"}
            className="px-3 py-1.5 rounded bg-neutral-100 hover:bg-white text-neutral-900 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium"
          >
            {mode === "working" ? "Stashing…" : "Stash changes"}
          </button>
        </div>
      </>
    );

  return (
    <Modal
      title="Clean working tree"
      subtitle={<p className="text-xs text-neutral-500 font-mono">{repoName}</p>}
      onClose={onClose}
      closable={mode !== "working"}
      footer={footer}
    >
      {loading ? (
        <div className="text-neutral-500 text-sm">Loading…</div>
      ) : !hasFiles ? (
        <div className="text-neutral-500 italic text-sm">
          Working tree is already clean.
        </div>
      ) : (
        <>
          <div className="text-xs text-neutral-500 mb-2">
            {changedCount} changed · {untrackedCount} untracked
          </div>
          <ul className="font-mono text-sm">
            {files.map((f) => (
              <li key={f.path} className="py-1 flex items-center gap-3">
                <span
                  className={`inline-block w-6 text-center shrink-0 ${statusColor(f)}`}
                >
                  <pre className="inline">{statusLabel(f)}</pre>
                </span>
                <span className="truncate">{f.path}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
