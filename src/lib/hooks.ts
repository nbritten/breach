import { useEffect, useRef } from "react";
import { api } from "./api";
import type { CiStatus } from "../types";

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
    // Bootstrap immediately rather than waiting a full interval, so the window
    // where notifications can land between the caller's initial PR fetch and our
    // baseline is milliseconds rather than `intervalMs`.
    tick();
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

/**
 * Poll listCiStatus on a fixed interval while the document is visible, so CI
 * dots track in-progress runs as they flip green/red without forcing the user
 * to hit Refresh. Unlike PRs, gh's run-list endpoint doesn't expose a
 * conditional-GET header, so this is plain interval polling — keep the
 * cadence relaxed.
 *
 * `request` is called on each tick to read the latest set of (path, branch)
 * pairs, so it stays in sync with the current repo list without re-binding
 * the effect.
 */
export function useCiStatusPoll(
  enabled: boolean,
  intervalMs: number,
  request: () => Array<{ path: string; branch: string }>,
  onUpdate: (statuses: Record<string, CiStatus>) => void,
) {
  const requestRef = useRef(request);
  requestRef.current = request;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const repos = requestRef.current();
      if (repos.length === 0) return;
      try {
        const result = await api.listCiStatus(repos);
        if (cancelled) return;
        onUpdateRef.current(result);
      } catch (err) {
        console.warn("CI status poll failed", err);
      }
    };

    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, intervalMs]);
}
