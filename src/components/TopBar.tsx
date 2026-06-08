import { useEffect, useRef, type CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSearch } from "../lib/search";
import { UpdateIndicator } from "./UpdateIndicator";
import logo from "../assets/logo.png";

export function TopBar() {
  const { query, setQuery } = useSearch();
  const { pathname } = useLocation();
  const isSettings = pathname.startsWith("/settings");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        setQuery("");
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setQuery]);

  const drag = { WebkitAppRegion: "drag" } as CSSProperties;
  const noDrag = { WebkitAppRegion: "no-drag" } as CSSProperties;

  const startDrag = async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("input, button, a, kbd, [data-no-drag]")) return;
    try {
      await getCurrentWindow().startDragging();
    } catch {
      // non-tauri environment, ignore
    }
  };

  return (
    <header
      data-tauri-drag-region
      onMouseDown={startDrag}
      onDoubleClick={() =>
        getCurrentWindow()
          .toggleMaximize()
          .catch((e) => console.warn("toggleMaximize failed", e))
      }
      style={drag}
      className="shrink-0 h-16 flex items-center pr-3 pl-[88px] bg-[#0d1024] text-white select-none border-b border-white/5"
    >
      <Link
        to="/"
        data-no-drag
        style={noDrag}
        title="Repositories"
        aria-label="Repositories"
        className="flex items-center gap-3 rounded-md -ml-1 pl-1 pr-2 py-1 hover:bg-white/5 transition-colors"
      >
        <img
          src={logo}
          alt=""
          className="w-9 h-9 rounded shrink-0"
          style={{ imageRendering: "pixelated" }}
          draggable={false}
        />
        <span className="font-semibold tracking-tight text-[15px]">
          Breach
        </span>
      </Link>

      <div className="ml-2 flex items-center">
        <UpdateIndicator />
      </div>

      <div data-tauri-drag-region style={drag} className="flex-1" />

      <div style={noDrag} className="relative">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/70 pointer-events-none"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search"
          className="w-64 h-8 pl-8 pr-12 rounded-md bg-white/10 placeholder-white/60 text-sm focus:outline-none focus:bg-white/20 focus:ring-2 focus:ring-white/40"
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono bg-white/15 text-white/80 rounded px-1.5 py-0.5 border border-white/20 pointer-events-none">
          ⌘K
        </kbd>
      </div>

      <Link
        to="/settings"
        data-no-drag
        style={noDrag}
        title="Settings"
        aria-label="Settings"
        className={`ml-2 flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
          isSettings
            ? "bg-white/15 text-white"
            : "text-white/60 hover:text-white hover:bg-white/10"
        }`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </Link>
    </header>
  );
}
