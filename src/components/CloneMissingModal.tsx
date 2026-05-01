import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { getRepoOrgs } from "../lib/settings";
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

type Phase = "listing" | "picking" | "cloning" | "done";

export function CloneMissingModal({ reposPath, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("listing");
  const [candidates, setCandidates] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CloneResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orgsConfigured, setOrgsConfigured] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const orgs = await getRepoOrgs();
        if (orgs.length === 0) {
          setOrgsConfigured(false);
          setPhase("picking");
          return;
        }
        const slugs = await api.listMissingRepos(reposPath, orgs);
        setCandidates(slugs);
        setPhase("picking");
      } catch (e) {
        setError(errorText(e));
      }
    })();
  }, [reposPath]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((s) => s.toLowerCase().includes(q));
  }, [candidates, query]);

  const visibleSelectedCount = useMemo(
    () => visible.filter((s) => selected.has(s)).length,
    [visible, selected],
  );
  const allVisibleSelected =
    visible.length > 0 && visibleSelectedCount === visible.length;
  const someVisibleSelected =
    visibleSelectedCount > 0 && !allVisibleSelected;

  // Drive the native indeterminate state for the select-all checkbox.
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const toggleOne = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const s of visible) next.delete(s);
      } else {
        for (const s of visible) next.add(s);
      }
      return next;
    });
  };

  const onClone = async () => {
    if (selected.size === 0) return;
    setPhase("cloning");
    try {
      const res = await api.cloneRepos(reposPath, Array.from(selected));
      setResults(res);
      setPhase("done");
    } catch (e) {
      setError(errorText(e));
      setPhase("done");
    }
  };

  const counts = useMemo(() => {
    if (!results) return null;
    return {
      cloned: results.filter((r) => r.status === "cloned").length,
      exists: results.filter((r) => r.status === "exists").length,
      error: results.filter((r) => r.status === "error").length,
    };
  }, [results]);

  const closable = phase !== "cloning";

  let footer: React.ReactNode = null;
  if (phase === "picking" && orgsConfigured && candidates.length > 0) {
    footer = (
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-neutral-500">
          {selected.size} of {candidates.length} selected
        </span>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onClone}
            disabled={selected.size === 0}
            className="px-3 py-1.5 rounded bg-emerald-600/80 hover:bg-emerald-600 text-sm disabled:opacity-40 disabled:hover:bg-emerald-600/80"
          >
            Clone {selected.size || ""}
          </button>
        </div>
      </div>
    );
  } else {
    footer = (
      <div className="flex justify-end">
        <button
          onClick={onClose}
          disabled={!closable}
          className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm disabled:opacity-50"
        >
          {closable ? "Close" : "Cloning…"}
        </button>
      </div>
    );
  }

  return (
    <Modal
      title="Clone missing repos"
      subtitle={
        <p className="text-xs text-neutral-500 font-mono truncate">{reposPath}</p>
      }
      onClose={onClose}
      closable={closable}
      footer={footer}
    >
      {error ? (
        <div className="text-rose-400 text-sm whitespace-pre-wrap">{error}</div>
      ) : phase === "listing" ? (
        <Spinner label="Listing org repos via gh…" />
      ) : phase === "cloning" ? (
        <Spinner label={`Cloning ${selected.size} repo${selected.size === 1 ? "" : "s"}…`} />
      ) : phase === "picking" && !orgsConfigured ? (
        <div className="text-neutral-500 italic text-sm">
          No orgs configured. Add one in Settings → GitHub orgs.
        </div>
      ) : phase === "picking" && candidates.length === 0 ? (
        <div className="text-neutral-400 text-sm flex items-center gap-2">
          <span className="text-emerald-400">✓</span>
          Everything in your configured orgs is already cloned.
        </div>
      ) : phase === "picking" ? (
        <div className="flex flex-col gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Filter by name…"
            autoFocus
            className="w-full px-3 py-1.5 rounded bg-neutral-900 border border-neutral-800 font-mono text-sm focus:outline-none focus:border-neutral-600"
          />
          <label className="flex items-center gap-2 text-xs text-neutral-400 select-none cursor-pointer">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              disabled={visible.length === 0}
              className="accent-emerald-500"
            />
            Select all{query.trim() ? " visible" : ""} ({visible.length})
          </label>
          <ul className="text-sm divide-y divide-neutral-800 max-h-[50vh] overflow-auto">
            {visible.map((slug) => (
              <li key={slug} className="py-1.5">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(slug)}
                    onChange={() => toggleOne(slug)}
                    className="accent-emerald-500"
                  />
                  <span className="font-mono text-xs truncate">{slug}</span>
                </label>
              </li>
            ))}
            {visible.length === 0 && (
              <li className="py-2 text-xs text-neutral-500 italic">
                No repos match "{query}"
              </li>
            )}
          </ul>
        </div>
      ) : results ? (
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
      ) : null}
    </Modal>
  );
}

function Spinner({ label }: { label: string }) {
  return (
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
      {label}
    </div>
  );
}
