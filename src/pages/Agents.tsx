import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentCard } from "../components/AgentCard";
import { EmptyState } from "../components/EmptyState";
import { agentNeedsAttention, sortAgentSessions } from "../lib/agents";
import { api } from "../lib/api";
import { errorText } from "../lib/errors";
import { useActiveAgentSessionsPoll } from "../lib/hooks";
import { getReposPath } from "../lib/settings";
import type { AgentSession, RepoSummary } from "../types";

export function Agents() {
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const path = await getReposPath();
      const nextRepos = await api.listRepos(path);
      const nextSessions = await api.listActiveAgentSessions(
        nextRepos.map((repo) => repo.path),
      );
      setRepos(nextRepos);
      setSessions(nextSessions);
      setError(null);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useActiveAgentSessionsPoll(
    repos.length > 0,
    5_000,
    () => repos.map((repo) => repo.path),
    setSessions,
  );

  const groups = useMemo(() => {
    const sorted = sortAgentSessions(sessions);
    return [
      { title: "Needs you", sessions: sorted.filter(agentNeedsAttention) },
      {
        title: "Working",
        sessions: sorted.filter(
          (session) =>
            session.state === "working" || session.state === "finishing",
        ),
      },
      {
        title: "Recently completed",
        sessions: sorted.filter(
          (session) =>
            session.state === "completed" || session.state === "idle",
        ),
      },
    ].filter((group) => group.sessions.length > 0);
  }, [sessions]);

  return (
    <main className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Agents</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Delegated work across your repositories, ordered by what needs
              you.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-100"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-5 rounded-md border border-rose-900/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}
        {!loading && sessions.length === 0 && (
          <EmptyState
            title="No active agents"
            subtitle="Start Codex or Claude in one of your repositories and it will appear here."
          />
        )}
        {loading && (
          <p className="text-sm text-neutral-500">Finding active agents…</p>
        )}

        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.title}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  {group.title}
                </h2>
                <span className="rounded-full bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                  {group.sessions.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.sessions.map((session) => (
                  <AgentCard key={session.id} session={session} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
