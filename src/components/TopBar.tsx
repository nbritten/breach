import { useEffect, useRef, type CSSProperties } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSearch } from "../lib/search";
import logo from "../assets/logo.png";

export function TopBar() {
  const { query, setQuery } = useSearch();
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
      <div
        data-tauri-drag-region
        style={drag}
        className="flex items-center gap-3 pointer-events-none"
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
    </header>
  );
}
