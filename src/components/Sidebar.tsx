import { Icon } from "./Icon";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { agentNeedsAttention } from "../lib/agents";
import { useAgentSessions } from "../lib/agentSessions";

const itemBase =
  "nav-item";
const active = "is-active";
const inactive =
  "";

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
  const isGitHub = pathname.startsWith("/github");
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
      className="sidebar"
    >
      <div className="nav-caption">Workspace</div>
      <Link
        to="/"
        title="Git"
        aria-label="Git"
        aria-current={isGit ? "page" : undefined}
        className={`${itemBase} ${isGit ? active : inactive}`}
      >
        <GitIcon />
        <span className="nav-label">Repositories</span>
      </Link>
      <Link to="/github" title="GitHub" aria-label="GitHub" aria-current={isGitHub ? "page" : undefined} className={`${itemBase} ${isGitHub ? active : inactive}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v10m7-13 3 3-3 3m3-3h1a1 1 0 0 1 1 1v9"/></svg>
        <span className="nav-label">GitHub</span>
      </Link>
      <Link
        to="/terminal"
        title="Terminal"
        aria-label="Terminal"
        aria-current={isTerminal ? "page" : undefined}
        className={`${itemBase} ${isTerminal ? active : inactive}`}
      >
        <Icon name="terminal" />
        <span className="nav-label">Terminal</span>
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
        <span className="nav-label">Agents</span>
        {attentionCount > 0 && (
          <span className="nav-attention min-w-4 rounded-full bg-amber-400 px-1 text-center text-[10px] font-semibold leading-4 text-neutral-950">
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
        <span className="nav-label">Settings</span>
      </button>
    </nav>
  );
}
