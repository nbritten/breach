import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { openUrl } from "@tauri-apps/plugin-opener";
import "@xterm/xterm/css/xterm.css";
import { useTerminalSession } from "../lib/terminalSession";
import { errorText } from "../lib/errors";

const encoder = new TextEncoder();

export function TerminalView({ sessionId }: { sessionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { subscribe, write, resize } = useTerminalSession();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
        window.requestAnimationFrame(() => searchInputRef.current?.select());
      } else if (event.key === "Escape" && searchOpen) {
        event.preventDefault();
        setSearchOpen(false);
        terminalRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      allowTransparency: true,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily:
        '"SFMono-Regular", "SF Mono", Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.3,
      scrollback: 5_000,
      theme: {
        background: "#0a0a0a",
        foreground: "#e5e5e5",
        cursor: "#f472b6",
        cursorAccent: "#0a0a0a",
        selectionBackground: "#52525280",
        black: "#171717",
        brightBlack: "#737373",
        red: "#fb7185",
        brightRed: "#fda4af",
        green: "#4ade80",
        brightGreen: "#86efac",
        yellow: "#facc15",
        brightYellow: "#fde047",
        blue: "#60a5fa",
        brightBlue: "#93c5fd",
        magenta: "#f472b6",
        brightMagenta: "#f9a8d4",
        cyan: "#22d3ee",
        brightCyan: "#67e8f9",
        white: "#d4d4d4",
        brightWhite: "#fafafa",
      },
    });
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(
      new WebLinksAddon((_event, uri) => {
        openUrl(uri).catch((error) =>
          console.warn("open terminal link failed", error),
        );
      }),
    );
    terminal.open(container);
    terminalRef.current = terminal;
    searchAddonRef.current = searchAddon;

    let cancelled = false;
    let unsubscribeOutput: (() => void) | null = null;
    const disposables = [
      terminal.onData((data) => {
        write(sessionId, encoder.encode(data)).catch(() => {});
      }),
      terminal.onBinary((data) => {
        const bytes = Uint8Array.from(data, (char) => char.charCodeAt(0));
        write(sessionId, bytes).catch(() => {});
      }),
    ];

    const fit = () => {
      fitAddon.fit();
      resize(sessionId, terminal.cols, terminal.rows).catch(() => {});
    };

    let frame = window.requestAnimationFrame(() => {
      fit();
      terminal.focus();
      try {
        unsubscribeOutput = subscribe(sessionId, (data) => terminal.write(data));
      } catch (error) {
        if (!cancelled) {
          terminal.writeln(
            `\r\n\x1b[31mCould not attach terminal: ${errorText(error)}\x1b[0m`,
          );
        }
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(fit);
    });
    resizeObserver.observe(container);

    // Web fonts resolving can change cell geometry without resizing the
    // container, so fit once more when the active font set settles.
    document.fonts?.ready.then(() => {
      if (container.isConnected) fit();
    });

    return () => {
      cancelled = true;
      unsubscribeOutput?.();
      disposables.forEach((disposable) => disposable.dispose());
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frame);
      terminal.dispose();
      terminalRef.current = null;
      searchAddonRef.current = null;
    };
  }, []);

  const find = (previous = false) => {
    if (!searchQuery) return;
    if (previous) searchAddonRef.current?.findPrevious(searchQuery);
    else searchAddonRef.current?.findNext(searchQuery);
  };

  return (
    <div className="relative h-full w-full bg-neutral-950">
      <div
        ref={containerRef}
        aria-label="Terminal"
        className="h-full w-full bg-neutral-950 px-4 py-3"
      />
      {searchOpen && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            find(false);
          }}
          className="absolute top-2 right-4 flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-900 p-1 shadow-xl"
        >
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => {
              const query = event.currentTarget.value;
              setSearchQuery(query);
              if (query) {
                searchAddonRef.current?.findNext(query, { incremental: true });
              }
            }}
            placeholder="Find"
            aria-label="Find in terminal"
            className="w-48 bg-transparent px-2 py-1 text-xs outline-none placeholder:text-neutral-600"
          />
          <button
            type="button"
            onClick={() => find(true)}
            title="Previous match"
            className="w-7 h-7 rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ↑
          </button>
          <button
            type="submit"
            title="Next match"
            className="w-7 h-7 rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchOpen(false);
              terminalRef.current?.focus();
            }}
            title="Close search"
            aria-label="Close search"
            className="w-7 h-7 rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ×
          </button>
        </form>
      )}
    </div>
  );
}
