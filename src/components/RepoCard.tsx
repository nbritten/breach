import { RefreshButton } from "./RefreshButton";
import { memo, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { TerminalLaunchButton } from "./TerminalLaunchButton";
import { useToast } from "../lib/toast";
import type {
  AgentProvider,
  CiStatus,
  PrInfo,
  RepoSummary,
} from "../types";
import { AGENT_INFO, AGENT_PROVIDER_ORDER } from "../lib/agents";

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
  onRefresh: (path: string) => Promise<unknown>;
  authoredPrs?: PrInfo[];
  reviewPrs?: PrInfo[];
  pinned?: boolean;
  onTogglePin?: (key: string) => void;
  pinKey?: string;
  pathLabel?: string | null;
  ci?: CiStatus;
  activeAgents?: ReadonlySet<AgentProvider>;
  docsUrl?: string | null;
  terminalActive?: boolean;
  onOpenTerminal?: (path: string) => Promise<void>;
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

export const RepoCard = memo(function RepoCard({
  repo,
  onRefresh,
  authoredPrs = [],
  reviewPrs = [],
  pinned = false,
  onTogglePin,
  pinKey,
  pathLabel,
  ci,
  activeAgents,
  docsUrl,
  terminalActive = false,
  onOpenTerminal,
}: Props) {
  const slug = encodeURIComponent(repo.path);
  const { showError } = useToast();

  const openFirst = (prs: PrInfo[], e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (prs.length === 0) return;
    openUrl(prs[0].url).catch(showError);
  };

  return (
    <article
      className="repo-card surface-card border-neutral-800"
    >
      <div className="repo-card-heading flex items-start justify-between gap-2">
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
              className={`relative w-2 h-2 rounded-full shrink-0 before:content-[''] before:absolute before:-inset-2 ${
                CI_DOT[ci.state].color
              } ${CI_DOT[ci.state].pulse ? "animate-pulse" : ""}`}
            />
          )}
          {activeAgents &&
            AGENT_PROVIDER_ORDER.filter((p) => activeAgents.has(p)).map(
              (provider) => {
                const info = AGENT_INFO[provider];
                return (
                  <span
                    key={provider}
                    title={`Active ${info.label} session`}
                    aria-label={`Active ${info.label} session`}
                    className="relative z-[1] shrink-0"
                    style={{ color: info.iconColor }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d={info.iconPath} />
                    </svg>
                  </span>
                );
              },
            )}
          {terminalActive && (
            <span
              title="Active Breach terminal"
              aria-label="Active Breach terminal"
              className="relative z-[1] text-breach-pink shrink-0"
            >
              &gt;_
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate" title={repo.path}>
              <Link className="repo-card-link" to={`/repo/${slug}`}>{repo.name}</Link>
            </h3>
            {pathLabel && (
              <p
                className="text-[10px] text-neutral-500 font-mono truncate"
                title={repo.path}
              >
                {pathLabel}
              </p>
            )}
          </div>
        </div>
        {repo.dirty && (
          <span className="status-badge status-changed">Changes</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-neutral-400">
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
          <span className="text-xs text-neutral-500">no upstream</span>
        )}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {authoredPrs.length > 0 && (
            <button
              onClick={(e) => openFirst(authoredPrs, e)}
              title={`Your open PRs:\n${prTooltip(authoredPrs)}`}
              aria-label={`${authoredPrs.length} open pull request${authoredPrs.length === 1 ? "" : "s"} you authored`}
              className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25"
            >
              PR {authoredPrs.length}
            </button>
          )}
          {reviewPrs.length > 0 && (
            <button
              onClick={(e) => openFirst(reviewPrs, e)}
              title={`Awaiting your review:\n${prTooltip(reviewPrs)}`}
              aria-label={`${reviewPrs.length} pull request${reviewPrs.length === 1 ? "" : "s"} awaiting your review`}
              className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25"
            >
              Review {reviewPrs.length}
            </button>
          )}
        </div>
      </div>

      {repo.last_commit ? (
        <div className="mt-4 text-xs text-neutral-500 truncate" title={`${repo.last_commit.subject} · ${repo.last_commit.author} · ${relTime(repo.last_commit.timestamp)}`}>
          <span className="text-neutral-400">{repo.last_commit.subject}</span>
          <span className="text-neutral-500">
            {" "}
            · {repo.last_commit.author} · {relTime(repo.last_commit.timestamp)}
          </span>
        </div>
      ) : repo.error ? (
        <div className="mt-3 text-xs text-rose-400 truncate">{repo.error}</div>
      ) : null}
      <div className="repo-card-footer">
        <span className="repo-card-open text-xs text-neutral-400" aria-hidden="true">Open repository ↗</span>
        <div className="repo-card-actions flex items-center gap-1">
          {onTogglePin && (
            <button
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                onTogglePin(pinKey ?? repo.name);
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
          <TerminalLaunchButton path={repo.path} onOpen={onOpenTerminal} iconOnly />
          <TerminalLaunchButton path={repo.path} external iconOnly />
          <RefreshButton onRefresh={() => onRefresh(repo.path)} label="Refresh this repo" description={`Refresh status for ${repo.name}`} />
        </div>
      </div>
    </article>
  );
});
