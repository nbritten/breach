import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

const FIXTURE = [
  "\x1b[1;35mbreach\x1b[0m \x1b[2m~/repos/breach\x1b[0m",
  "",
  "\x1b[32m❯\x1b[0m git status --short",
  " M src/App.tsx",
  "?? src/pages/Terminal.tsx",
  "",
  "\x1b[32m❯\x1b[0m ",
];

export function TerminalView() {
  const containerRef = useRef<HTMLDivElement>(null);

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

    let frame = window.requestAnimationFrame(() => {
      fitAddon.fit();
      for (const line of FIXTURE.slice(0, -1)) terminal.writeln(line);
      terminal.write(FIXTURE.at(-1) ?? "");
      terminal.focus();
    });

    const resizeObserver = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => fitAddon.fit());
    });
    resizeObserver.observe(container);

    // Web fonts resolving can change cell geometry without resizing the
    // container, so fit once more when the active font set settles.
    document.fonts?.ready.then(() => {
      if (container.isConnected) fitAddon.fit();
    });

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frame);
      terminal.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-label="Terminal preview"
      className="h-full w-full bg-neutral-950 px-4 py-3"
    />
  );
}
