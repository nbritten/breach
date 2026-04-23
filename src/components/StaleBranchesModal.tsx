import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import {
  FALLBACK_DEFAULT_BRANCH,
  getBranchOverrides,
  getDefaultBranch,
} from "../lib/settings";
import type { BranchDeleteResult, StaleBranch } from "../types";
import { errorText } from "../lib/errors";
import { Modal } from "./Modal";

interface Props {
  reposPath: string;
  onClose: () => void;
}

function relDays(ts: number): string {
  if (ts === 0) return "—";
  const days = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (days < 1) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

type Phase = "loading" | "ready" | "running" | "done" | "error";

export function StaleBranchesModal({ reposPath, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [branches, setBranches] = useState<StaleBranch[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<BranchDeleteResult[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [overrides, fallback] = await Promise.all([
          getBranchOverrides(),
          getDefaultBranch(),
        ]);
        const list = await api.listStaleBranches(
          reposPath,
          overrides,
          fallback || FALLBACK_DEFAULT_BRANCH,
        );
        list.sort((a, b) => {
          if (a.repo_name !== b.repo_name) {
            return a.repo_name.localeCompare(b.repo_name);
          }
          return b.last_commit_ts - a.last_commit_ts;
        });
        setBranches(list);
        setSelected(new Set(list.map((b) => `${b.repo_path}::${b.branch}`)));
        setPhase("ready");
      } catch (e) {
        setErrorMsg(errorText(e));
        setPhase("error");
      }
    })();
  }, [reposPath]);

  const grouped = useMemo(() => {
    const by: Record<string, { repoName: string; branches: StaleBranch[] }> = {};
    for (const b of branches) {
      const key = b.repo_path;
      if (!by[key]) by[key] = { repoName: b.repo_name, branches: [] };
      by[key].branches.push(b);
    }
    return Object.entries(by);
  }, [branches]);

  const toggle = (key: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selectAll = () =>
    setSelected(new Set(branches.map((b) => `${b.repo_path}::${b.branch}`)));
  const selectNone = () => setSelected(new Set());

  const runDelete = async () => {
    const toDelete = branches.filter((b) =>
      selected.has(`${b.repo_path}::${b.branch}`),
    );
    if (toDelete.length === 0) return;
    setPhase("running");
    try {
      const res = await api.deleteBranches(
        toDelete.map((b) => ({ repoPath: b.repo_path, branch: b.branch })),
      );
      setResults(res);
      setPhase("done");
    } catch (e) {
      setErrorMsg(errorText(e));
      setPhase("error");
    }
  };

  const canClose = phase !== "running";

  const resultByKey = useMemo(() => {
    const m = new Map<string, BranchDeleteResult>();
    for (const r of results ?? []) m.set(`${r.repo_path}::${r.branch}`, r);
    return m;
  }, [results]);

  const footer = (
    <div className="flex items-center justify-between">
      <div className="text-xs text-neutral-500">
        {phase === "done"
          ? `Deleted ${results?.filter((r) => r.ok).length ?? 0}${
              (results?.filter((r) => !r.ok).length ?? 0) > 0
                ? `, ${results?.filter((r) => !r.ok).length} failed`
                : ""
            }`
          : "Uses git branch -D. Reversible via reflog within 30 days."}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onClose}
          disabled={!canClose}
          className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm disabled:opacity-50"
        >
          {phase === "done" ? "Close" : "Cancel"}
        </button>
        {phase === "ready" && (
          <button
            onClick={runDelete}
            disabled={selected.size === 0}
            className="px-3 py-1.5 rounded bg-rose-700/60 hover:bg-rose-700 border border-rose-700/70 text-sm disabled:opacity-50"
          >
            Delete {selected.size}
          </button>
        )}
        {phase === "running" && (
          <button
            disabled
            className="px-3 py-1.5 rounded bg-neutral-800 text-sm opacity-70"
          >
            Running…
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      title="Prune merged branches"
      subtitle={
        <p className="text-xs text-neutral-500">
          Local branches already merged into their default. Safe to delete.
        </p>
      }
      onClose={onClose}
      closable={canClose}
      width="720px"
      footer={footer}
    >
      {phase === "loading" ? (
        <div className="flex items-center gap-3 text-neutral-400 text-sm">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-spin"
          >
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <path d="M21 3v6h-6" />
          </svg>
          Scanning all repos for merged branches…
        </div>
      ) : phase === "error" ? (
        <div className="text-rose-400 text-sm whitespace-pre-wrap">
          {errorMsg}
        </div>
      ) : branches.length === 0 ? (
        <div className="text-neutral-500 italic text-sm">
          Nothing to prune — no local branches are merged into their default.
        </div>
      ) : (
        <>
          {phase !== "done" && (
            <div className="mb-3 flex items-center gap-3 text-xs">
              <span className="text-neutral-500">
                {selected.size} of {branches.length} selected
              </span>
              <button
                onClick={selectAll}
                className="text-neutral-400 hover:text-neutral-100 underline underline-offset-2"
              >
                all
              </button>
              <button
                onClick={selectNone}
                className="text-neutral-400 hover:text-neutral-100 underline underline-offset-2"
              >
                none
              </button>
            </div>
          )}
          <div className="flex flex-col gap-4">
            {grouped.map(([path, g]) => (
              <div key={path}>
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1">
                  {g.repoName}{" "}
                  <span className="text-neutral-600 font-normal">
                    · {g.branches.length} branch
                    {g.branches.length === 1 ? "" : "es"}
                  </span>
                </div>
                <ul className="text-sm divide-y divide-neutral-800 border border-neutral-800 rounded">
                  {g.branches.map((b) => {
                    const key = `${b.repo_path}::${b.branch}`;
                    const res = resultByKey.get(key);
                    return (
                      <li
                        key={key}
                        className="px-3 py-1.5 flex items-center gap-3"
                      >
                        {phase === "done" ? (
                          <span
                            className={`w-4 text-center ${
                              res?.ok
                                ? "text-emerald-400"
                                : res
                                ? "text-rose-400"
                                : "text-neutral-600"
                            }`}
                          >
                            {res?.ok ? "✓" : res ? "✗" : "·"}
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={selected.has(key)}
                            onChange={() => toggle(key)}
                            disabled={phase === "running"}
                            className="accent-sky-500"
                          />
                        )}
                        <span className="font-mono text-[13px] flex-1 truncate">
                          {b.branch}
                        </span>
                        <span className="text-xs text-neutral-500 shrink-0">
                          {relDays(b.last_commit_ts)}
                        </span>
                        {res?.error && (
                          <span
                            title={res.error}
                            className="text-xs text-rose-400/80 max-w-[200px] truncate"
                          >
                            {res.error}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
