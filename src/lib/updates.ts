import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { LazyStore } from "@tauri-apps/plugin-store";

const store = new LazyStore("settings.json");

const SKIPPED_VERSION_KEY = "updateSkippedVersion";

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

export async function checkForUpdate(): Promise<Update | null> {
  try {
    return await check();
  } catch (e) {
    // Network failures, server errors, signature mismatches — none of them
    // should surface a toast or block the app. The dot just stays hidden.
    console.warn("update check failed", e);
    return null;
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
