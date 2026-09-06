import { useEffect, useRef, type CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSearch } from "../lib/search";
import { UpdateIndicator } from "./UpdateIndicator";
import logo from "../assets/logo.png";

export function TopBar() {
  const { query, setQuery } = useSearch();
  const { pathname } = useLocation();
  const isGit = pathname === "/" || pathname.startsWith("/repo/");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        isGit &&
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "k"
      ) {
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
  }, [isGit, setQuery]);

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
      className="titlebar shrink-0 h-14 flex items-center pr-5 pl-[88px] select-none"
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
          className="w-7 h-7 rounded shrink-0 opacity-85"
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

      {isGit && (
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
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search repositories…"
            aria-label="Search repositories"
            className="search-field w-64 h-8 pl-8 pr-12 text-xs"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono bg-white/5 text-neutral-400 rounded px-1.5 py-0.5 border border-white/10 pointer-events-none">
            ⌘K
          </kbd>
        </div>
      )}
    </header>
  );
}
