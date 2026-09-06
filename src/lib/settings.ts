import { resolveTheme, type ThemeId } from "./themes";
import { LazyStore } from "@tauri-apps/plugin-store";
import { api, isDemoModeActive } from "./api";
import { getDemoPinnedRepos, setDemoPinnedRepos } from "./demoFixtures";

// Adding a new setting key? Also update src/lib/settingsIo.ts
// (SettingsExport, buildExport, parseImport, applyImport) so it round-trips
// through the Export / Import flow.
const store = new LazyStore("settings.json");

const REPOS_PATH_KEY = "reposPath";
const BRANCH_OVERRIDES_KEY = "branchOverrides";
const DEFAULT_BRANCH_KEY = "defaultBranch";
const REPO_ORGS_KEY = "repoOrgs";
const PINNED_REPOS_KEY = "pinnedRepos";
const ONBOARDED_KEY = "onboarded";
const SERVICE_URL_TEMPLATE_KEY = "serviceUrlTemplate";
const SERVICE_REPOS_KEY = "serviceRepos";
const TERMINAL_APP_KEY = "terminalApp";
const CHECK_FOR_UPDATES_KEY = "checkForUpdates";
const SCAN_NESTED_REPOS_KEY = "scanNestedRepos";
const GROUP_NESTED_REPOS_KEY = "groupNestedRepos";
const DEMO_MODE_KEY = "demoMode";
const TERMINAL_WORKSPACE_KEY = "terminalWorkspace";

export type SavedTerminalWorkspace = {
  sessions: { cwd: string; title: string }[];
  activeIndex: number;
};

export const FALLBACK_DEFAULT_BRANCH = "main";

export async function getReposPath(): Promise<string> {
  const existing = await store.get<string>(REPOS_PATH_KEY);
  if (existing) return existing;
  const fallback = await api.defaultReposPath();
  await store.set(REPOS_PATH_KEY, fallback);
  await store.save();
  return fallback;
}

export async function setReposPath(path: string): Promise<void> {
  await store.set(REPOS_PATH_KEY, path);
  await store.save();
}

export async function getBranchOverrides(): Promise<Record<string, string>> {
  const map = (await store.get<Record<string, string>>(BRANCH_OVERRIDES_KEY)) ?? {};
  return expandStoredPathKeys(map);
}

export async function setBranchOverrides(map: Record<string, string>): Promise<void> {
  await store.set(BRANCH_OVERRIDES_KEY, await expandStoredPathKeys(map));
  await store.save();
}

export async function getDefaultBranch(): Promise<string> {
  return (await store.get<string>(DEFAULT_BRANCH_KEY)) ?? FALLBACK_DEFAULT_BRANCH;
}

export async function setDefaultBranch(branch: string): Promise<void> {
  await store.set(DEFAULT_BRANCH_KEY, branch);
  await store.save();
}

export async function getRepoOrgs(): Promise<string[]> {
  return (await store.get<string[]>(REPO_ORGS_KEY)) ?? [];
}

export async function setRepoOrgs(list: string[]): Promise<void> {
  await store.set(REPO_ORGS_KEY, list);
  await store.save();
}

export async function getPinnedRepos(): Promise<string[]> {
  const list = (await store.get<string[]>(PINNED_REPOS_KEY)) ?? [];
  return Promise.all(list.map(expandStoredPath));
}

// Demo mode pins the curated 10 repos at the top regardless of the user's real
// `pinnedRepos` setting, so the dashboard layout looks intentional. The real
// pinnedRepos is untouched — toggle demo off and the user's pins come back.
export async function getEffectivePinnedRepos(): Promise<string[]> {
  if (isDemoModeActive()) return getDemoPinnedRepos();
  return getPinnedRepos();
}

// In demo mode, pin changes live in an in-memory store that resets when demo
// mode is turned off — so a user pinning during a demo session doesn't leak
// fake repo names into their real pinned-repos setting.
export async function setEffectivePinnedRepos(pins: string[]): Promise<void> {
  if (isDemoModeActive()) {
    setDemoPinnedRepos(pins);
    return;
  }
  await setPinnedRepos(pins);
}

export async function getServiceUrlTemplate(): Promise<string> {
  return (await store.get<string>(SERVICE_URL_TEMPLATE_KEY)) ?? "";
}

export async function setServiceUrlTemplate(tpl: string): Promise<void> {
  await store.set(SERVICE_URL_TEMPLATE_KEY, tpl);
  await store.save();
}

export async function getServiceRepos(): Promise<string[]> {
  const list = (await store.get<string[]>(SERVICE_REPOS_KEY)) ?? [];
  return Promise.all(list.map(expandStoredPath));
}

export async function setServiceRepos(list: string[]): Promise<void> {
  const expanded = await Promise.all(list.map(expandStoredPath));
  await store.set(SERVICE_REPOS_KEY, expanded);
  await store.save();
}

export async function getTerminalApp(): Promise<string> {
  return (await store.get<string>(TERMINAL_APP_KEY)) ?? "";
}

export async function setTerminalApp(app: string): Promise<void> {
  await store.set(TERMINAL_APP_KEY, app);
  await store.save();
}

export async function getCheckForUpdates(): Promise<boolean> {
  return (await store.get<boolean>(CHECK_FOR_UPDATES_KEY)) ?? true;
}

export async function setCheckForUpdates(enabled: boolean): Promise<void> {
  await store.set(CHECK_FOR_UPDATES_KEY, enabled);
  await store.save();
}

export async function getScanNestedRepos(): Promise<boolean> {
  return (await store.get<boolean>(SCAN_NESTED_REPOS_KEY)) ?? false;
}

export async function setScanNestedRepos(enabled: boolean): Promise<void> {
  await store.set(SCAN_NESTED_REPOS_KEY, enabled);
  await store.save();
}

export async function getGroupNestedRepos(): Promise<boolean> {
  return (await store.get<boolean>(GROUP_NESTED_REPOS_KEY)) ?? true;
}

export async function setGroupNestedRepos(enabled: boolean): Promise<void> {
  await store.set(GROUP_NESTED_REPOS_KEY, enabled);
  await store.save();
}

// Intentionally not exported via settingsIo: demoMode is a local UI toggle, not
// something to round-trip through Export / Import.
export async function getDemoMode(): Promise<boolean> {
  return (await store.get<boolean>(DEMO_MODE_KEY)) ?? false;
}

export async function setDemoMode(enabled: boolean): Promise<void> {
  await store.set(DEMO_MODE_KEY, enabled);
  await store.save();
}

// Terminal workspace state is intentionally local rather than part of the
// settings export: it contains machine-specific paths and describes running
// context, not a portable preference.
export async function getTerminalWorkspace(): Promise<SavedTerminalWorkspace> {
  const saved = await store.get<unknown>(TERMINAL_WORKSPACE_KEY);
  return normalizeTerminalWorkspace(saved);
}

export async function setTerminalWorkspace(
  workspace: SavedTerminalWorkspace,
): Promise<void> {
  await store.set(TERMINAL_WORKSPACE_KEY, workspace);
  await store.save();
}

export function normalizeTerminalWorkspace(
  value: unknown,
): SavedTerminalWorkspace {
  const empty = { sessions: [], activeIndex: 0 };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return empty;
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.sessions)) return empty;
  const sessions = record.sessions.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return [];
    }
    const session = entry as Record<string, unknown>;
    if (typeof session.cwd !== "string" || !session.cwd.trim()) return [];
    const title =
      typeof session.title === "string" && session.title.trim()
        ? session.title.trim()
        : session.cwd.replace(/\/+$/, "").split("/").pop() || session.cwd;
    return [{ cwd: session.cwd, title }];
  });
  const requested =
    typeof record.activeIndex === "number" &&
    Number.isInteger(record.activeIndex)
      ? record.activeIndex
      : 0;
  return {
    sessions,
    activeIndex: Math.max(0, Math.min(requested, sessions.length - 1)),
  };
}

/**
 * Open the path in whichever terminal the user has configured. Empty setting
 * falls back to the backend's auto-detect: the first installed terminal from
 * the known set, or Terminal as the universal fallback.
 */
export async function openTerminal(repoPath: string): Promise<string> {
  const app = await getTerminalApp();
  return api.openInTerminal(repoPath, app);
}

export function buildServiceUrl(
  template: string,
  repoName: string,
): string | null {
  if (!template.trim() || !repoName) return null;
  if (!template.includes("{name}")) return template;
  return template.replace(/\{name\}/g, repoName);
}

export async function getOnboarded(): Promise<boolean> {
  return (await store.get<boolean>(ONBOARDED_KEY)) === true;
}

export async function setOnboarded(v: boolean): Promise<void> {
  await store.set(ONBOARDED_KEY, v);
  await store.save();
}

export async function setPinnedRepos(list: string[]): Promise<void> {
  const expanded = await Promise.all(list.map(expandStoredPath));
  await store.set(PINNED_REPOS_KEY, expanded);
  await store.save();
}

export function branchForRepo(
  repoName: string,
  overrides: Record<string, string>,
  defaultBranch: string,
  repoPath?: string,
): string {
  if (repoPath && overrides[repoPath]) return overrides[repoPath];
  return overrides[repoName] ?? defaultBranch;
}

/** `~/…` pins and override keys expand so they match absolute `repo.path`. */
async function expandStoredPath(s: string): Promise<string> {
  if (!s.startsWith("~")) return s;
  return api.expandPath(s);
}

async function expandStoredPathKeys(
  map: Record<string, string>,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    out[await expandStoredPath(k)] = v;
  }
  return out;
}

export async function getTheme(): Promise<ThemeId> {
  return resolveTheme(await store.get<unknown>("theme"));
}

export async function setTheme(theme: ThemeId): Promise<void> {
  const previous = await store.get<unknown>("theme");
  await store.set("theme", theme);
  try {
    await store.save();
  } catch (error) {
    await store.set("theme", resolveTheme(previous));
    throw error;
  }
}
