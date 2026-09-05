import { Link, useLocation, useNavigate } from "react-router-dom";

const itemBase =
  "flex items-center justify-center w-10 h-10 rounded-lg transition-colors";
const active = "bg-neutral-800 text-neutral-100";
const inactive =
  "text-neutral-500 hover:text-neutral-100 hover:bg-neutral-800/60";

function GitIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <path d="M6 8v8M8 6h8M18 8c0 5.5-4.5 10-10 10" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" />
    </svg>
  );
}

export function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isGit = pathname === "/" || pathname.startsWith("/repo/");
  const isTerminal = pathname.startsWith("/terminal");
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
    <nav aria-label="Workspaces" className="shrink-0 w-16 h-full border-r border-neutral-800 bg-neutral-950 flex flex-col items-center py-3 gap-2">
      <Link to="/" title="Git" aria-label="Git" aria-current={isGit ? "page" : undefined} className={`${itemBase} ${isGit ? active : inactive}`}>
        <GitIcon />
      </Link>
      <Link to="/terminal" title="Terminal" aria-label="Terminal" aria-current={isTerminal ? "page" : undefined} className={`${itemBase} ${isTerminal ? active : inactive}`}>
        <TerminalIcon />
      </Link>
      <div className="flex-1" />
      <button type="button" onClick={toggleSettings} title={isSettings ? "Close settings" : "Settings"} aria-label={isSettings ? "Close settings" : "Settings"} aria-pressed={isSettings} className={`${itemBase} ${isSettings ? active : inactive}`}>
        <SettingsIcon />
      </button>
    </nav>
  );
}
