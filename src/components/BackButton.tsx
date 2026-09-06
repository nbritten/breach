import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";

export function BackButton() {
  const location = useLocation();
  const navigate = useNavigate();
  // BrowserRouter's index counts entries within this app, unlike history.length,
  // which can include pages outside Breach. Re-read on each route transition.
  const canGoBack = useMemo(() => {
    const index = (window.history.state as { idx?: number } | null)?.idx;
    return typeof index === "number" && index > 0;
  }, [location]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const shortcut = (event.metaKey && !event.altKey && event.key === "[") ||
        (event.altKey && !event.metaKey && event.key === "ArrowLeft");
      if (!shortcut || event.shiftKey || event.ctrlKey || event.defaultPrevented) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable=true], .xterm")) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      // Even at the first entry, keep this shortcut inside the app.
      event.preventDefault();
      if (canGoBack) void navigate(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canGoBack, navigate]);

  return (
    <Tooltip content={canGoBack ? "Go back · ⌘[" : "No previous screen"} align="left" width="w-48">
      <Button variant="ghost" iconOnly disabled={!canGoBack} aria-label="Go back" aria-keyshortcuts="Meta+[ Alt+ArrowLeft" onClick={() => { if (canGoBack) void navigate(-1); }}>
        <Icon name="back" />
      </Button>
    </Tooltip>
  );
}
