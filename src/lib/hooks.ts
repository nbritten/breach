import { useEffect, useRef } from "react";
import { api } from "./api";

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

/**
 * Poll GitHub's notifications endpoint with a conditional GET to detect when the
 * caller's PRs may have changed (review requests, new comments, merges, etc.) and
 * fire `onChange` when they have. The first poll just establishes a baseline
 * `Last-Modified` and never fires `onChange` — the caller is expected to have
 * already loaded PRs once before this hook is enabled.
 *
 * Pauses while the document is hidden (no point polling for a window the user
 * isn't looking at) and resumes on visibility change.
 */
export function usePrNotificationsPoll(
  enabled: boolean,
  intervalMs: number,
  onChange: () => void,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let lastModified: string | null = null;
    let bootstrapped = false;

    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await api.pollPrNotifications(lastModified);
        if (cancelled) return;
        if (res.last_modified) lastModified = res.last_modified;
        if (!bootstrapped) {
          bootstrapped = true;
          return;
        }
        if (res.changed) onChangeRef.current();
      } catch (err) {
        // Network blips and transient gh errors shouldn't toast — quietly try again
        // on the next interval.
        console.warn("PR notification poll failed", err);
      }
    };

    const id = window.setInterval(tick, intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs]);
}
