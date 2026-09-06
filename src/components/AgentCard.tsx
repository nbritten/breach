import { Link } from "react-router-dom";
import { AGENT_INFO, AGENT_STATE_INFO } from "../lib/agents";
import type { AgentSession } from "../types";

function repoName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function relativeTime(timestamp?: number): string {
  if (!timestamp) return "Active now";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function AgentCard({ session }: { session: AgentSession }) {
  const provider = AGENT_INFO[session.provider];
  const state = AGENT_STATE_INFO[session.state];
  const message = session.attention_reason ?? session.last_message;

  return (
    <Link
      to={`/agents/${encodeURIComponent(session.id)}`}
      className="surface-card block min-h-44 border-neutral-800"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`relative h-2.5 w-2.5 shrink-0 rounded-full ${state.dot} ${state.pulse ? "animate-pulse" : ""}`}
          />
          <span className="truncate text-xs font-medium text-neutral-300">
            {state.label}
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-neutral-500">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{ color: provider.iconColor }}
            aria-hidden="true"
          >
            <path d={provider.iconPath} />
          </svg>
          {provider.label}
        </span>
      </div>

      <h3 className="mt-4 truncate font-semibold">
        {session.title ?? `${provider.label} in ${repoName(session.repo_path)}`}
      </h3>
      <p className="mt-1 truncate text-xs text-neutral-500">
        {repoName(session.repo_path)}
      </p>

      <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 text-neutral-300">
        {message ?? "Agent session is active in this repository."}
      </p>

      <div className="mt-5 border-t border-neutral-800 pt-3 flex items-center justify-between text-xs text-neutral-500">
        <span>{relativeTime(session.updated_at)}</span>
        <span className="text-neutral-300">Open →</span>
      </div>
    </Link>
  );
}
