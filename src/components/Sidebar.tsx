import { Link, useLocation, useNavigate } from "react-router-dom";
import { agentNeedsAttention } from "../lib/agents";
import { useAgentSessions } from "../lib/agentSessions";

const itemBase =
  "flex items-center justify-center w-10 h-10 rounded-lg transition-colors";
const active = "bg-neutral-800 text-neutral-100";
const inactive =
  "text-neutral-500 hover:text-neutral-100 hover:bg-neutral-800/60";

function GitIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <path d="M6 8v8M8 6h8M18 8c0 5.5-4.5 10-10 10" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function AgentsIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="7" width="14" height="11" rx="3" />
      <path d="M9 3h6M12 3v4M9 12h.01M15 12h.01M9 16h6" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" />
    </svg>
  );
}

export function Sidebar() {
  const { sessions } = useAgentSessions();
  const attentionCount = sessions.filter(agentNeedsAttention).length;
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isGit = pathname === "/" || pathname.startsWith("/repo/");
  const isTerminal = pathname.startsWith("/terminal");
  const isAgents = pathname.startsWith("/agents");
  const isSettings = pathname.startsWith("/settings");

  const toggleSettings = () => {
    if (!isSettings) {
      navigate("/settings");
      return;
    }
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/");
  };

  return (
    <nav
      aria-label="Workspaces"
      className="shrink-0 w-16 h-full border-r border-neutral-800 bg-neutral-950 flex flex-col items-center py-3 gap-2"
    >
      <Link
        to="/"
        title="Git"
        aria-label="Git"
        aria-current={isGit ? "page" : undefined}
        className={`${itemBase} ${isGit ? active : inactive}`}
      >
        <GitIcon />
      </Link>
      <Link
        to="/terminal"
        title="Terminal"
        aria-label="Terminal"
        aria-current={isTerminal ? "page" : undefined}
        className={`${itemBase} ${isTerminal ? active : inactive}`}
      >
        <TerminalIcon />
      </Link>
      <Link
        to="/agents"
        title={
          attentionCount > 0 ? `Agents · ${attentionCount} need you` : "Agents"
        }
        aria-label="Agents"
        aria-current={isAgents ? "page" : undefined}
        className={`${itemBase} relative ${isAgents ? active : inactive}`}
      >
        <AgentsIcon />
        {attentionCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-amber-400 px-1 text-center text-[10px] font-semibold leading-4 text-neutral-950">
            {attentionCount > 9 ? "9+" : attentionCount}
          </span>
        )}
      </Link>
      <div className="flex-1" />
      <button
        type="button"
        onClick={toggleSettings}
        title={isSettings ? "Close settings" : "Settings"}
        aria-label={isSettings ? "Close settings" : "Settings"}
        aria-pressed={isSettings}
        className={`${itemBase} ${isSettings ? active : inactive}`}
      >
        <SettingsIcon />
      </button>
    </nav>
  );
}
