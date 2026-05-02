import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import {
  branchForRepo,
  getBranchOverrides,
  getDefaultBranch,
  openTerminal,
} from "../lib/settings";
import { useToast } from "../lib/toast";
import { errorText } from "../lib/errors";
import { DiffView } from "../components/DiffView";
import { CleanModal } from "../components/CleanModal";
import type { CommitInfo } from "../types";

type View =
  | { kind: "working" }
  | { kind: "commit"; sha: string; subject: string };

export function RepoDetail() {
  const { path: slug } = useParams<{ path: string }>();
  const repoPath = useMemo(() => (slug ? decodeURIComponent(slug) : ""), [slug]);
  const repoName = useMemo(() => repoPath.split("/").filter(Boolean).pop() ?? "", [repoPath]);

  const [view, setView] = useState<View>({ kind: "working" });
  const [diff, setDiff] = useState<string>("");
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClean, setShowClean] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [defaultBranch, setDefaultBranch] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const { showError } = useToast();

  const loadDiff = useCallback(async (v: View) => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const text =
        v.kind === "working"
          ? await api.repoDiff(repoPath)
          : await api.commitDiff(repoPath, v.sha);
      setDiff(text);
    } catch (e) {
      setError(errorText(e));
      setDiff("");
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    if (!repoPath) return;
    api.repoLog(repoPath, 50).then(setCommits).catch((e) => setError(String(e)));
  }, [repoPath, reloadToken]);

  useEffect(() => {
    if (!repoPath || !repoName) return;
    Promise.all([getBranchOverrides(), getDefaultBranch()])
      .then(([overrides, fallback]) =>
        setDefaultBranch(branchForRepo(repoName, overrides, fallback)),
      )
      .catch((e) => console.warn("settings load failed", e));
  }, [repoPath, repoName]);

  const doSync = useCallback(async () => {
    if (!defaultBranch) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const branch = await api.repoSyncToDefault(repoPath, defaultBranch);
      setSyncMsg({ kind: "ok", text: `Up to date on ${branch}` });
      setReloadToken((t) => t + 1);
      setTimeout(() => setSyncMsg(null), 2500);
    } catch (e) {
      setSyncMsg({ kind: "err", text: errorText(e) });
    } finally {
      setSyncing(false);
    }
  }, [repoPath, defaultBranch]);

  useEffect(() => {
    loadDiff(view);
  }, [view, loadDiff, reloadToken]);

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center gap-4">
        <Link to="/" className="text-sm text-neutral-400 hover:text-neutral-100">
          ← Back
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{repoName}</h1>
          <p className="text-xs text-neutral-500 font-mono truncate">{repoPath}</p>
        </div>
        <button
          onClick={() => openTerminal(repoPath).catch(showError)}
          title="Open in terminal"
          className="shrink-0 px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm flex items-center gap-1.5"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          Terminal
        </button>
        <button
          onClick={() => setShowClean(true)}
          className="shrink-0 px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm"
        >
          Clean…
        </button>
        <button
          onClick={doSync}
          disabled={syncing || !defaultBranch}
          className="shrink-0 px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm disabled:opacity-50"
        >
          {syncing
            ? "Syncing…"
            : defaultBranch
            ? `Sync to ${defaultBranch}`
            : "Sync"}
        </button>
      </header>

      {syncMsg && (
        <div
          className={`px-6 py-2 text-sm border-b ${
            syncMsg.kind === "ok"
              ? "bg-emerald-950/40 border-emerald-900 text-emerald-300"
              : "bg-rose-950/40 border-rose-900 text-rose-300"
          }`}
        >
          {syncMsg.text}
          {syncMsg.kind === "err" && (
            <button
              onClick={() => setSyncMsg(null)}
              className="ml-3 text-xs underline opacity-70 hover:opacity-100"
            >
              dismiss
            </button>
          )}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 shrink-0 border-r border-neutral-800 overflow-auto">
          <button
            onClick={() => setView({ kind: "working" })}
            className={`w-full text-left px-4 py-3 border-b border-neutral-800 hover:bg-neutral-900 ${
              view.kind === "working" ? "bg-neutral-900" : ""
            }`}
          >
            <div className="text-sm font-medium">Working tree</div>
            <div className="text-xs text-neutral-500">Uncommitted changes vs HEAD</div>
          </button>

          <div className="px-4 py-2 text-[11px] uppercase tracking-wide text-neutral-500">
            Recent commits
          </div>

          {commits.map((c) => {
            const active = view.kind === "commit" && view.sha === c.sha;
            return (
              <button
                key={c.sha}
                onClick={() =>
                  setView({ kind: "commit", sha: c.sha, subject: c.subject })
                }
                className={`w-full text-left px-4 py-2 border-b border-neutral-900 hover:bg-neutral-900 ${
                  active ? "bg-neutral-900" : ""
                }`}
              >
                <div className="text-sm truncate">{c.subject}</div>
                <div className="text-xs text-neutral-500 font-mono">
                  {c.short_sha} · {c.author}
                </div>
              </button>
            );
          })}
        </aside>

        <section className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-6 text-neutral-500 text-sm">Loading diff…</div>
          ) : error ? (
            <div className="p-6 text-rose-400 text-sm">{error}</div>
          ) : (
            <DiffView
              diff={diff}
              empty={
                view.kind === "working"
                  ? "Working tree is clean."
                  : "No diff for this commit."
              }
            />
          )}
        </section>
      </div>

      {showClean && (
        <CleanModal
          repoPath={repoPath}
          repoName={repoName}
          onClose={() => setShowClean(false)}
          onDone={() => {
            setShowClean(false);
            setView({ kind: "working" });
            setReloadToken((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}
