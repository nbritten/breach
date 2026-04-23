import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { getPinnedRepos, getRepoOrgs } from "../lib/settings";
import type { CloneResult } from "../types";
import { errorText } from "../lib/errors";
import { Modal } from "./Modal";

interface Props {
  reposPath: string;
  onClose: () => void;
}

const STATUS_CONFIG: Record<
  CloneResult["status"],
  { icon: string; color: string; label: string }
> = {
  cloned: { icon: "✓", color: "text-emerald-400", label: "cloned" },
  exists: { icon: "·", color: "text-neutral-500", label: "exists" },
  error: { icon: "✗", color: "text-rose-400", label: "error" },
};

export function CloneMissingModal({ reposPath, onClose }: Props) {
  const [results, setResults] = useState<CloneResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [orgs, pinned] = await Promise.all([
          getRepoOrgs(),
          getPinnedRepos(),
        ]);
        if (orgs.length === 0) {
          setResults([]);
          return;
        }
        const res = await api.cloneMissing(reposPath, orgs, pinned);
        setResults(res);
      } catch (e) {
        setError(errorText(e));
      }
    })();
  }, [reposPath]);

  const counts = useMemo(() => {
    if (!results) return null;
    return {
      cloned: results.filter((r) => r.status === "cloned").length,
      exists: results.filter((r) => r.status === "exists").length,
      error: results.filter((r) => r.status === "error").length,
    };
  }, [results]);

  const done = !!(results || error);

  const footer = (
    <div className="flex justify-end">
      <button
        onClick={onClose}
        disabled={!done}
        className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm disabled:opacity-50"
      >
        {done ? "Close" : "Running…"}
      </button>
    </div>
  );

  return (
    <Modal
      title="Clone missing repos"
      subtitle={
        <p className="text-xs text-neutral-500 font-mono truncate">{reposPath}</p>
      }
      onClose={onClose}
      closable={done}
      footer={footer}
    >
      {error ? (
        <div className="text-rose-400 text-sm whitespace-pre-wrap">{error}</div>
      ) : !results ? (
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
          Listing org repos and cloning via gh…
        </div>
      ) : results.length === 0 ? (
        <div className="text-neutral-500 italic text-sm">
          No orgs configured. Add one in Settings → GitHub orgs.
        </div>
      ) : (
        <>
          {counts && (
            <div className="text-xs text-neutral-500 mb-3">
              <span className="text-emerald-400">{counts.cloned} cloned</span>
              {counts.exists > 0 && (
                <>
                  <span> · </span>
                  <span>{counts.exists} already present</span>
                </>
              )}
              {counts.error > 0 && (
                <>
                  <span> · </span>
                  <span className="text-rose-400">{counts.error} error</span>
                </>
              )}
            </div>
          )}
          <ul className="text-sm divide-y divide-neutral-800">
            {results.map((r) => {
              const cfg = STATUS_CONFIG[r.status];
              return (
                <li
                  key={r.slug}
                  className="py-1.5 flex items-start gap-3"
                  title={r.error ?? ""}
                >
                  <span className={`w-5 text-center shrink-0 ${cfg.color}`}>
                    {cfg.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-mono text-xs">{r.slug}</div>
                    {r.error && (
                      <div className="text-xs text-rose-400/80 truncate mt-0.5">
                        {r.error}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs shrink-0 ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Modal>
  );
}
