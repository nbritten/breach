import { api } from "./api";
import {
  FALLBACK_DEFAULT_BRANCH,
  getBranchOverrides,
  getCheckForUpdates,
  getDefaultBranch,
  getPinnedRepos,
  getRepoOrgs,
  getReposPath,
  getScanNestedRepos,
  getGroupNestedRepos,
  getServiceRepos,
  getServiceUrlTemplate,
  getTerminalApp,
  setBranchOverrides,
  setCheckForUpdates,
  setDefaultBranch,
  setPinnedRepos,
  setRepoOrgs,
  setReposPath,
  setScanNestedRepos,
  setGroupNestedRepos,
  setServiceRepos,
  setServiceUrlTemplate,
  setTerminalApp,
} from "./settings";

export const SETTINGS_VERSION = 1;

export interface SettingsExport {
  version: number;
  settings: {
    reposPath: string;
    defaultBranch: string;
    branchOverrides: Record<string, string>;
    repoOrgs: string[];
    pinnedRepos: string[];
    serviceUrlTemplate: string;
    serviceRepos: string[];
    terminalApp: string;
    checkForUpdates: boolean;
    scanNestedRepos: boolean;
    groupNestedRepos: boolean;
  };
}

// `onboarded` is intentionally excluded from the export payload: importing on a
// fresh machine should not skip the welcome wizard.
export async function buildExport(): Promise<SettingsExport> {
  const [
    reposPath,
    defaultBranch,
    branchOverrides,
    repoOrgs,
    pinnedRepos,
    serviceUrlTemplate,
    serviceRepos,
    terminalApp,
    checkForUpdates,
    scanNestedRepos,
    groupNestedRepos,
  ] = await Promise.all([
    getReposPath(),
    getDefaultBranch(),
    getBranchOverrides(),
    getRepoOrgs(),
    getPinnedRepos(),
    getServiceUrlTemplate(),
    getServiceRepos(),
    getTerminalApp(),
    getCheckForUpdates(),
    getScanNestedRepos(),
    getGroupNestedRepos(),
  ]);
  return {
    version: SETTINGS_VERSION,
    settings: {
      reposPath: await api.homeRelative(reposPath),
      defaultBranch,
      branchOverrides,
      repoOrgs,
      pinnedRepos,
      serviceUrlTemplate,
      serviceRepos,
      terminalApp,
      checkForUpdates,
      scanNestedRepos,
      groupNestedRepos,
    },
  };
}

export function downloadExport(
  payload: SettingsExport,
  filename = "breach-settings.json",
): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function pickJsonFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", () =>
      resolve(input.files?.[0] ?? null),
    );
    // `cancel` (recent Chromium / WebKit) fires when the user dismisses the picker;
    // without it, the promise would hang forever on cancellation. Browsers without
    // support degrade to the original behavior, which is a benign dead promise.
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

export function parseImport(text: string): SettingsExport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Not valid JSON");
  }
  if (!isObject(data)) throw new Error("Top-level must be an object");
  if (typeof data.version !== "number") {
    throw new Error("Missing or invalid `version` field");
  }
  if (data.version !== SETTINGS_VERSION) {
    throw new Error(
      `Unsupported settings version ${data.version} (expected ${SETTINGS_VERSION})`,
    );
  }
  if (!isObject(data.settings)) throw new Error("Missing `settings` object");
  const s = data.settings;

  if (typeof s.reposPath !== "string") throw new Error("`reposPath` must be a string");
  if (typeof s.defaultBranch !== "string") throw new Error("`defaultBranch` must be a string");
  if (!isStringMap(s.branchOverrides)) throw new Error("`branchOverrides` must be string→string");
  if (!isStringArray(s.repoOrgs)) throw new Error("`repoOrgs` must be string[]");
  if (!isStringArray(s.pinnedRepos)) throw new Error("`pinnedRepos` must be string[]");
  if (typeof s.serviceUrlTemplate !== "string") throw new Error("`serviceUrlTemplate` must be a string");
  if (!isStringArray(s.serviceRepos)) throw new Error("`serviceRepos` must be string[]");
  // terminalApp was added after v1 shipped; treat a missing value as "" (auto-detect)
  // so older exports keep importing cleanly. Wrong-type values still error loudly.
  if (s.terminalApp !== undefined && typeof s.terminalApp !== "string") {
    throw new Error("`terminalApp` must be a string");
  }
  if (s.checkForUpdates !== undefined && typeof s.checkForUpdates !== "boolean") {
    throw new Error("`checkForUpdates` must be a boolean");
  }
  // scanNestedRepos was added after v1 shipped; treat a missing value as
  // false so older exports keep the original shallow-scan behavior.
  if (s.scanNestedRepos !== undefined && typeof s.scanNestedRepos !== "boolean") {
    throw new Error("`scanNestedRepos` must be a boolean");
  }
  // groupNestedRepos defaults on: it's the nested-scan companion, and a
  // missing key should match the Settings checkbox's default-checked state.
  if (s.groupNestedRepos !== undefined && typeof s.groupNestedRepos !== "boolean") {
    throw new Error("`groupNestedRepos` must be a boolean");
  }

  return {
    version: data.version,
    settings: {
      reposPath: s.reposPath,
      defaultBranch: s.defaultBranch,
      branchOverrides: s.branchOverrides,
      repoOrgs: s.repoOrgs,
      pinnedRepos: s.pinnedRepos,
      serviceUrlTemplate: s.serviceUrlTemplate,
      serviceRepos: s.serviceRepos,
      terminalApp: typeof s.terminalApp === "string" ? s.terminalApp : "",
      checkForUpdates:
        typeof s.checkForUpdates === "boolean" ? s.checkForUpdates : true,
      scanNestedRepos:
        typeof s.scanNestedRepos === "boolean" ? s.scanNestedRepos : false,
      groupNestedRepos:
        typeof s.groupNestedRepos === "boolean" ? s.groupNestedRepos : true,
    },
  };
}

export async function applyImport(payload: SettingsExport): Promise<void> {
  const s = normalizeSettings(payload.settings);
  await Promise.all([
    setReposPath(s.reposPath),
    setDefaultBranch(s.defaultBranch),
    setBranchOverrides(s.branchOverrides),
    setRepoOrgs(s.repoOrgs),
    setPinnedRepos(s.pinnedRepos),
    setServiceUrlTemplate(s.serviceUrlTemplate),
    setServiceRepos(s.serviceRepos),
    setTerminalApp(s.terminalApp),
    setCheckForUpdates(s.checkForUpdates),
    setScanNestedRepos(s.scanNestedRepos),
    setGroupNestedRepos(s.groupNestedRepos),
  ]);
}

// Mirrors the trim/filter pass that the Settings form does on save, so an
// imported file can't end up persisted with the form looking one way and a
// later save normalizing the same fields differently.
function normalizeSettings(
  s: SettingsExport["settings"],
): SettingsExport["settings"] {
  const cleanedOverrides: Record<string, string> = {};
  for (const [k, v] of Object.entries(s.branchOverrides)) {
    const name = k.trim();
    const branch = v.trim();
    if (name && branch) cleanedOverrides[name] = branch;
  }
  return {
    reposPath: s.reposPath.trim(),
    defaultBranch: s.defaultBranch.trim() || FALLBACK_DEFAULT_BRANCH,
    branchOverrides: cleanedOverrides,
    repoOrgs: s.repoOrgs.map((x) => x.trim()).filter((x) => x.length > 0),
    pinnedRepos: s.pinnedRepos.map((x) => x.trim()).filter((x) => x.length > 0),
    serviceUrlTemplate: s.serviceUrlTemplate.trim(),
    serviceRepos: s.serviceRepos.map((x) => x.trim()).filter((x) => x.length > 0),
    terminalApp: s.terminalApp.trim(),
    checkForUpdates: s.checkForUpdates,
    scanNestedRepos: s.scanNestedRepos,
    groupNestedRepos: s.groupNestedRepos,
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isStringMap(v: unknown): v is Record<string, string> {
  return isObject(v) && Object.values(v).every((x) => typeof x === "string");
}
