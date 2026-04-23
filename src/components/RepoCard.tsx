import { useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import type { CiStatus, PrInfo, RepoSummary } from "../types";

function relTime(ts: number): string {
  const now = Date.now() / 1000;
  const diff = now - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))}mo ago`;
  return `${Math.floor(diff / (86400 * 365))}y ago`;
}

interface Props {
  repo: RepoSummary;
  onRefresh: (path: string) => Promise<void>;
  authoredPrs?: PrInfo[];
  reviewPrs?: PrInfo[];
  pinned?: boolean;
  onTogglePin?: (name: string) => void;
  ci?: CiStatus;
  docsUrl?: string | null;
}

const CI_DOT: Record<
  CiStatus["state"],
  { color: string; label: string; pulse?: boolean }
> = {
  success: { color: "bg-emerald-400", label: "CI passing" },
  failure: { color: "bg-rose-500", label: "CI failing" },
  in_progress: { color: "bg-sky-400", label: "CI running", pulse: true },
  other: { color: "bg-neutral-500", label: "CI" },
};

function prTooltip(prs: PrInfo[]): string {
  return prs
    .map((p) => `#${p.number} ${p.title}${p.is_draft ? " (draft)" : ""}`)
    .join("\n");
}

export function RepoCard({
  repo,
  onRefresh,
  authoredPrs = [],
  reviewPrs = [],
  pinned = false,
  onTogglePin,
  ci,
  docsUrl,
}: Props) {
  const slug = encodeURIComponent(repo.path);
  const [refreshing, setRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const { showError } = useToast();

  const openFirst = (prs: PrInfo[], e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (prs.length === 0) return;
    openUrl(prs[0].url).catch(showError);
  };

  const handleRefresh = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRefreshing(true);
    const started = Date.now();
    try {
      await onRefresh(repo.path);
      const elapsed = Date.now() - started;
      if (elapsed < 500) {
        await new Promise((r) => setTimeout(r, 500 - elapsed));
      }
      setJustRefreshed(true);
      setTimeout(() => setJustRefreshed(false), 800);
    } finally {
      setRefreshing(false);
    }
  };

  const borderClass = justRefreshed
    ? "border-emerald-500/60"
    : "border-neutral-800 hover:border-neutral-600";

  return (
    <Link
      to={`/repo/${slug}`}
      className={`block rounded-lg border bg-neutral-900 hover:bg-neutral-800/60 transition p-4 ${borderClass}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {ci && (
            <button
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                if (ci.url) openUrl(ci.url).catch(showError);
              }}
              title={`${CI_DOT[ci.state].label}${
                ci.workflow ? ` · ${ci.workflow}` : ""
              }`}
              aria-label={CI_DOT[ci.state].label}
              className={`w-2 h-2 rounded-full shrink-0 ${
                CI_DOT[ci.state].color
              } ${CI_DOT[ci.state].pulse ? "animate-pulse" : ""}`}
            />
          )}
          <h3 className="font-semibold truncate">{repo.name}</h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {repo.dirty && (
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              dirty
            </span>
          )}
          {onTogglePin && (
            <button
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                onTogglePin(repo.name);
              }}
              title={pinned ? "Unpin" : "Pin"}
              aria-label={pinned ? "Unpin" : "Pin"}
              className={`p-1 rounded hover:bg-neutral-700/60 ${
                pinned
                  ? "text-amber-300 hover:text-amber-200"
                  : "text-neutral-500 hover:text-neutral-100"
              }`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill={pinned ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 17v5" />
                <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
              </svg>
            </button>
          )}
          {docsUrl && (
            <button
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                openUrl(docsUrl).catch(showError);
              }}
              title={`Open service docs\n${docsUrl}`}
              aria-label="Open service docs"
              className="p-1 rounded text-neutral-500 hover:text-neutral-100 hover:bg-neutral-700/60"
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
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </button>
          )}
          <button
            onClick={(e: MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              api.openInTerminal(repo.path).catch(showError);
            }}
            title="Open in terminal"
            aria-label="Open in terminal"
            className="p-1 rounded text-neutral-500 hover:text-neutral-100 hover:bg-neutral-700/60"
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
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh this repo"
            aria-label="Refresh this repo"
            className="p-1 rounded text-neutral-500 hover:text-neutral-100 hover:bg-neutral-700/60 disabled:opacity-50"
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
              className={refreshing ? "animate-spin" : ""}
            >
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 text-sm text-neutral-400">
        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-200 truncate max-w-[60%]">
          {repo.branch ?? "—"}
        </span>
        {repo.has_upstream && (repo.ahead > 0 || repo.behind > 0) && (
          <span className="text-xs flex items-center gap-1">
            {repo.ahead > 0 && <span className="text-emerald-400">↑{repo.ahead}</span>}
            {repo.behind > 0 && <span className="text-rose-400">↓{repo.behind}</span>}
          </span>
        )}
        {!repo.has_upstream && (
          <span className="text-xs text-neutral-600">no upstream</span>
        )}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {authoredPrs.length > 0 && (
            <button
              onClick={(e) => openFirst(authoredPrs, e)}
              title={`Your open PRs:\n${prTooltip(authoredPrs)}`}
              className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25"
            >
              PR {authoredPrs.length}
            </button>
          )}
          {reviewPrs.length > 0 && (
            <button
              onClick={(e) => openFirst(reviewPrs, e)}
              title={`Awaiting your review:\n${prTooltip(reviewPrs)}`}
              className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25"
            >
              RR {reviewPrs.length}
            </button>
          )}
        </div>
      </div>

      {repo.last_commit ? (
        <div className="mt-3 text-xs text-neutral-500 truncate">
          <span className="text-neutral-400">{repo.last_commit.subject}</span>
          <span className="text-neutral-600">
            {" "}
            · {repo.last_commit.author} · {relTime(repo.last_commit.timestamp)}
          </span>
        </div>
      ) : repo.error ? (
        <div className="mt-3 text-xs text-rose-400 truncate">{repo.error}</div>
      ) : null}
    </Link>
  );
}
