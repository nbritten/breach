import { Button } from "./Button";
import { Icon } from "./Icon";
import { errorText } from "../lib/errors";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCheckForUpdates } from "../lib/settings";
import {
  checkForUpdate,
  getLastCheckedAt,
  getSkippedVersion,
  installAndRelaunch,
  setSkippedVersion,
  shouldNotifyAboutUpdate,
  shouldRecheck,
  UPDATE_REFRESH_EVENT,
  type UpdateRefreshDetail,
} from "../lib/updates";

const RELEASE_URL = "https://github.com/nbritten/breach/releases/tag/v";

export function UpdateIndicator() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"installing" | "skipping" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState("Downloading update…");
  const busyRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const titleId = useId();
  const installing = action === "installing";
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const [result, skipped] = await Promise.all([
        checkForUpdate(),
        getSkippedVersion(),
      ]);
      if (cancelled || busyRef.current) return;
      setUpdate(shouldNotifyAboutUpdate(result, skipped) ? result : null);
    };

    const refreshIfEnabled = async () => {
      const enabled = await getCheckForUpdates();
      if (!enabled || cancelled) return;
      await refresh();
    };

    // On launch: always check (subject to the user's enabled toggle).
    void refreshIfEnabled().catch((error) => console.warn("update check failed", error));

    // On window focus: re-check, but only if the throttle window has elapsed
    // since the last check — switching apps shouldn't pile up requests.
    const onFocus = async () => {
      let enabled: boolean;
      let lastAt: number | null;
      try {
        enabled = await getCheckForUpdates();
        lastAt = await getLastCheckedAt();
      } catch (error) { console.warn("update settings unavailable", error); return; }
      if (!enabled || cancelled) return;
      if (!shouldRecheck(lastAt, Date.now())) return;
      await refresh().catch((error) => console.warn("update check failed", error));
    };

    // Manual checks from the Settings page already ran the network call;
    // we just adopt the result here so we don't fire a second one.
    const onManualRefresh = (e: Event) => {
      const detail = (e as CustomEvent<UpdateRefreshDetail>).detail;
      if (cancelled || busyRef.current || !detail) return;
      setUpdate(
        shouldNotifyAboutUpdate(detail.update, detail.skippedVersion)
          ? detail.update
          : null,
      );
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener(UPDATE_REFRESH_EVENT, onManualRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(UPDATE_REFRESH_EVENT, onManualRefresh);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!update) return null;

  const onInstall = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setAction("installing");
    setError(null);
    setProgress(null);
    setPhase("Downloading update…");
    let downloaded = 0;
    let total = 0;
    try {
      await installAndRelaunch(update, (event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) setProgress(Math.min(100, Math.round(downloaded / total * 100)));
        }
        if (event.event === "Finished") { setPhase("Installing update…"); setProgress(null); }
      });
      setPhase("Restarting Breach…");
    } catch (cause) {
      setError(`Update could not finish. ${errorText(cause)}`);
      setAction(null);
      busyRef.current = false;
    }
  };

  const onNotes = async () => {
    try { await openUrl(`${RELEASE_URL}${update.version}`); }
    catch (cause) { setError(`Release notes could not open. ${errorText(cause)}`); }
  };

  const onSkip = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setAction("skipping");
    setError(null);
    try {
      await setSkippedVersion(update.version);
      setOpen(false);
      setUpdate(null);
    } catch (cause) {
      setError(`This version could not be skipped. ${errorText(cause)}`);
    } finally { busyRef.current = false; setAction(null); }
  };

  const noDrag = { WebkitAppRegion: "no-drag" } as CSSProperties;

  return (
    <div ref={containerRef} style={noDrag} className="relative" data-no-drag
      onBlur={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <Button ref={triggerRef} variant="ghost" className="update-trigger" aria-label={`Update available: ${update.version}`} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? panelId : undefined} onClick={() => setOpen((value) => !value)}>
        <Icon name={installing ? "refresh" : "download"} className={installing ? "animate-spin" : ""} />
        {installing ? "Updating…" : "Update available"}
      </Button>
      {open && (
        <div ref={panelRef} id={panelId} role="dialog" aria-labelledby={titleId} tabIndex={-1} className="update-panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={titleId} className="text-sm font-semibold">Breach {update.version}</h2>
              <p className="mt-1 text-xs text-neutral-400">A new version is ready to install.</p>
            </div>
            <Button variant="ghost" iconOnly aria-label="Close update details" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}><Icon name="close" /></Button>
          </div>
          <p className="mt-4 text-xs leading-5 text-neutral-400">Breach will restart after installing. Finish any active work before updating.</p>
          {error && <p className="mt-3 text-xs leading-5 text-rose-300" role="alert">{error}</p>}
          {installing && <div className="mt-4"><p role="status" className="text-xs text-neutral-300">{phase}{progress !== null ? ` ${progress}%` : ""}</p><progress className="update-progress" aria-label="Update download progress" value={progress ?? undefined} max={100} /></div>}
          <div className="mt-4 flex flex-col gap-2">
            <Button variant="primary" disabled={action !== null} aria-busy={installing} onClick={() => void onInstall()}><Icon name={installing ? "refresh" : "download"} className={installing ? "animate-spin" : ""} />{installing ? "Updating…" : "Install and restart"}</Button>
            <Button variant="ghost" onClick={() => void onNotes()}>View release notes</Button>
            <Button variant="ghost" disabled={action !== null} onClick={() => void onSkip()}>{action === "skipping" ? "Skipping…" : "Skip this version"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
