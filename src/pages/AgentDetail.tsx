import { Link, useNavigate, useParams } from "react-router-dom";
import { AGENT_INFO, AGENT_STATE_INFO } from "../lib/agents";
import { useAgentSessions } from "../lib/agentSessions";
import { useTerminalSession } from "../lib/terminalSession";

export function AgentDetail() {
  const { id = "" } = useParams();
  const sessionId = decodeURIComponent(id);
  const navigate = useNavigate();
  const { open: openTerminal } = useTerminalSession();
  const { sessions, loading } = useAgentSessions();
  const session =
    sessions.find((candidate) => candidate.id === sessionId) ?? null;

  if (loading)
    return <div className="p-6 text-sm text-neutral-500">Loading agent…</div>;
  if (session === null) {
    return (
      <main className="p-6">
        <div className="mx-auto max-w-3xl rounded-lg border border-neutral-800 bg-neutral-900 p-6">
          <h1 className="font-semibold">Agent is no longer running</h1>
          <p className="mt-2 text-sm text-neutral-500">
            The process ended or moved outside a configured repository.
          </p>
          <Link
            to="/agents"
            className="mt-5 inline-block text-sm text-neutral-300 hover:text-white"
          >
            ← Back to agents
          </Link>
        </div>
      </main>
    );
  }

  const provider = AGENT_INFO[session.provider];
  const state = AGENT_STATE_INFO[session.state];
  const repoSlug = encodeURIComponent(session.repo_path);

  const showTerminal = async () => {
    await openTerminal(session.cwd);
    navigate("/terminal");
  };

  return (
    <main className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/agents"
          className="text-xs text-neutral-500 hover:text-neutral-200"
        >
          ← Agents
        </Link>
        <section className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900 p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`h-2.5 w-2.5 rounded-full ${state.dot} ${state.pulse ? "animate-pulse" : ""}`}
              />
              <span>{state.label}</span>
            </div>
            <span className="flex items-center gap-2 text-sm text-neutral-400">
              <svg
                width="16"
                height="16"
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

          <h1 className="mt-6 text-xl font-semibold">
            {session.title ?? `${provider.label} agent`}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">{session.repo_path}</p>

          {(session.attention_reason || session.last_message) && (
            <div className="mt-6 rounded-md border border-neutral-800 bg-neutral-950 p-4 text-sm leading-6 text-neutral-300">
              {session.attention_reason ?? session.last_message}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              to={`/repo/${repoSlug}`}
              className="rounded-md bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-white"
            >
              Open repository
            </Link>
            <button
              type="button"
              onClick={showTerminal}
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800"
            >
              Open terminal here
            </button>
          </div>

          <div className="mt-8 border-t border-neutral-800 pt-5">
            <h2 className="text-sm font-medium">Externally managed session</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-500">
              Breach can observe this process and take you to its workspace.
              Conversation and approval controls will appear here only for
              sessions launched through a provider connection that exposes those
              events.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
