import { LazyStore } from "@tauri-apps/plugin-store";
import { api } from "./api";

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
  return (await store.get<Record<string, string>>(BRANCH_OVERRIDES_KEY)) ?? {};
}

export async function setBranchOverrides(map: Record<string, string>): Promise<void> {
  await store.set(BRANCH_OVERRIDES_KEY, map);
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
  return (await store.get<string[]>(PINNED_REPOS_KEY)) ?? [];
}

export async function getServiceUrlTemplate(): Promise<string> {
  return (await store.get<string>(SERVICE_URL_TEMPLATE_KEY)) ?? "";
}

export async function setServiceUrlTemplate(tpl: string): Promise<void> {
  await store.set(SERVICE_URL_TEMPLATE_KEY, tpl);
  await store.save();
}

export async function getServiceRepos(): Promise<string[]> {
  return (await store.get<string[]>(SERVICE_REPOS_KEY)) ?? [];
}

export async function setServiceRepos(list: string[]): Promise<void> {
  await store.set(SERVICE_REPOS_KEY, list);
  await store.save();
}

export async function getTerminalApp(): Promise<string> {
  return (await store.get<string>(TERMINAL_APP_KEY)) ?? "";
}

export async function setTerminalApp(app: string): Promise<void> {
  await store.set(TERMINAL_APP_KEY, app);
  await store.save();
}

/// Open the path in whichever terminal the user has configured. Empty setting
/// falls back to the backend's auto-detect (Ghostty if installed, else Terminal).
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
  await store.set(PINNED_REPOS_KEY, list);
  await store.save();
}

export function branchForRepo(
  repoName: string,
  overrides: Record<string, string>,
  defaultBranch: string,
): string {
  return overrides[repoName] ?? defaultBranch;
}
