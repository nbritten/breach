import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { LazyStore } from "@tauri-apps/plugin-store";

const store = new LazyStore("settings.json");

const SKIPPED_VERSION_KEY = "updateSkippedVersion";
const LAST_CHECKED_AT_KEY = "updateLastCheckedAt";

const RECHECK_THROTTLE_MS = 4 * 60 * 60 * 1000; // 4 hours

// Dispatched on `window` after a manual or focus-driven check, so the indicator
// in the titlebar can re-fetch its state without us needing a shared store.
export const UPDATE_REFRESH_EVENT = "breach:update-refresh";

export async function getSkippedVersion(): Promise<string | null> {
  return (await store.get<string>(SKIPPED_VERSION_KEY)) ?? null;
}

export async function setSkippedVersion(version: string | null): Promise<void> {
  if (version === null) {
    await store.delete(SKIPPED_VERSION_KEY);
  } else {
    await store.set(SKIPPED_VERSION_KEY, version);
  }
  await store.save();
}

export async function getLastCheckedAt(): Promise<number | null> {
  return (await store.get<number>(LAST_CHECKED_AT_KEY)) ?? null;
}

async function setLastCheckedAt(at: number): Promise<void> {
  await store.set(LAST_CHECKED_AT_KEY, at);
  await store.save();
}

export async function checkForUpdate(): Promise<Update | null> {
  try {
    return await check();
  } catch (e) {
    // Network failures, server errors, signature mismatches — none of them
    // should surface a toast or block the app. The dot just stays hidden.
    console.warn("update check failed", e);
    return null;
  } finally {
    // Record the timestamp even on failure so a flaky network doesn't make
    // focus-driven rechecks hammer the endpoint every time the user switches
    // back to the app.
    await setLastCheckedAt(Date.now());
  }
}

export async function installAndRelaunch(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}

export function shouldNotifyAboutUpdate(
  update: Update | null,
  skippedVersion: string | null,
): boolean {
  if (!update) return false;
  if (skippedVersion && update.version === skippedVersion) return false;
  return true;
}

export function shouldRecheck(
  lastCheckedAt: number | null,
  now: number,
  throttleMs: number = RECHECK_THROTTLE_MS,
): boolean {
  if (lastCheckedAt === null) return true;
  return now - lastCheckedAt >= throttleMs;
}
