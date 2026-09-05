import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useTerminalSession } from "../lib/terminalSession";
import { errorText } from "../lib/errors";

const encoder = new TextEncoder();

export function TerminalView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { start, subscribe, write, resize } = useTerminalSession();

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
    terminal.loadAddon(fitAddon);
    terminal.open(container);

    let cancelled = false;
    let unsubscribeOutput: (() => void) | null = null;
    let activeSessionId: string | null = null;
    const disposables = [
      terminal.onData((data) => {
        if (activeSessionId) {
          write(activeSessionId, encoder.encode(data)).catch(() => {});
        }
      }),
      terminal.onBinary((data) => {
        if (!activeSessionId) return;
        const bytes = Uint8Array.from(data, (char) => char.charCodeAt(0));
        write(activeSessionId, bytes).catch(() => {});
      }),
    ];

    const fit = () => {
      fitAddon.fit();
      if (activeSessionId) {
        resize(activeSessionId, terminal.cols, terminal.rows).catch(() => {});
      }
    };

    let frame = window.requestAnimationFrame(() => {
      fit();
      terminal.focus();
      start(terminal.cols, terminal.rows)
        .then((session) => {
          if (cancelled) return;
          activeSessionId = session.id;
          unsubscribeOutput = subscribe(session.id, (data) =>
            terminal.write(data),
          );
          return resize(session.id, terminal.cols, terminal.rows);
        })
        .catch((error) => {
          if (!cancelled) {
            terminal.writeln(
              `\r\n\x1b[31mCould not start terminal: ${errorText(error)}\x1b[0m`,
            );
          }
        });
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
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-label="Terminal"
      className="h-full w-full bg-neutral-950 px-4 py-3"
    />
  );
}
