import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCheckForUpdates } from "../lib/settings";
import {
  checkForUpdate,
  getSkippedVersion,
  installAndRelaunch,
  setSkippedVersion,
  shouldNotifyAboutUpdate,
} from "../lib/updates";

const RELEASE_URL = "https://github.com/nbritten/breach/releases/tag/v";

export function UpdateIndicator() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const enabled = await getCheckForUpdates();
      if (!enabled || cancelled) return;
      const [result, skipped] = await Promise.all([
        checkForUpdate(),
        getSkippedVersion(),
      ]);
      if (cancelled) return;
      if (shouldNotifyAboutUpdate(result, skipped)) setUpdate(result);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!update) return null;

  const onInstall = async () => {
    setInstalling(true);
    try {
      await installAndRelaunch(update);
    } catch (e) {
      console.warn("update install failed", e);
      setInstalling(false);
    }
  };

  const onNotes = () => {
    openUrl(`${RELEASE_URL}${update.version}`).catch((e) =>
      console.warn("open release notes failed", e),
    );
  };

  const onSkip = async () => {
    await setSkippedVersion(update.version);
    setUpdate(null);
    setOpen(false);
  };

  const noDrag = { WebkitAppRegion: "no-drag" } as CSSProperties;

  return (
    <div ref={containerRef} style={noDrag} className="relative" data-no-drag>
      <button
        type="button"
        aria-label={`Update available: ${update.version}`}
        title={`Update available: ${update.version}`}
        onClick={() => setOpen((v) => !v)}
        className="block w-2.5 h-2.5 rounded-full bg-emerald-400 hover:bg-emerald-300 transition-colors"
      />
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-md border border-neutral-800 bg-neutral-900 shadow-lg py-1 z-50">
          <div className="px-3 py-1.5 text-xs text-neutral-400 border-b border-neutral-800 mb-1">
            Update available: {update.version}
          </div>
          <button
            type="button"
            onClick={onInstall}
            disabled={installing}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {installing ? "Installing…" : "Install update"}
          </button>
          <button
            type="button"
            onClick={onNotes}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            View release notes
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            Skip this version
          </button>
        </div>
      )}
    </div>
  );
}
