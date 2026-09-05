export function Terminal() {
  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-neutral-800 px-6 py-4">
        <h1 className="text-lg font-semibold">Terminal</h1>
        <p className="text-xs text-neutral-500">Run commands without leaving Breach.</p>
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-xl border border-neutral-800 bg-neutral-900 flex items-center justify-center text-neutral-400">
            <TerminalPlaceholderIcon />
          </div>
          <h2 className="text-sm font-medium text-neutral-200">Embedded terminal coming next</h2>
          <p className="mt-1 text-sm text-neutral-500">This workspace will keep shells and repository work together.</p>
        </div>
      </main>
    </div>
  );
}

function TerminalPlaceholderIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}
