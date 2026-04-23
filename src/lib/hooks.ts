import { useEffect } from "react";

/**
 * Listen for the Escape key and fire `onEscape`. Set `enabled` to false to skip
 * the listener entirely (useful when a modal is running an operation that
 * shouldn't be dismissible).
 */
export function useEscapeKey(onEscape: () => void, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEscape, enabled]);
}
