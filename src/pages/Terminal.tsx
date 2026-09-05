import { TerminalView } from "../components/TerminalView";

export function Terminal() {
  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-neutral-800 px-6 py-4">
        <h1 className="text-lg font-semibold">Terminal</h1>
        <p className="text-xs text-neutral-500">Run commands without leaving Breach.</p>
      </header>
      <main className="flex-1 min-h-0">
        <TerminalView />
      </main>
    </div>
  );
}
