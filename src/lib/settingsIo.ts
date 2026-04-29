import { api } from "./api";
import {
  FALLBACK_DEFAULT_BRANCH,
  getBranchOverrides,
  getDefaultBranch,
  getPinnedRepos,
  getRepoOrgs,
  getReposPath,
  getServiceRepos,
  getServiceUrlTemplate,
  setBranchOverrides,
  setDefaultBranch,
  setPinnedRepos,
  setRepoOrgs,
  setReposPath,
  setServiceRepos,
  setServiceUrlTemplate,
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
  ] = await Promise.all([
    getReposPath(),
    getDefaultBranch(),
    getBranchOverrides(),
    getRepoOrgs(),
    getPinnedRepos(),
    getServiceUrlTemplate(),
    getServiceRepos(),
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

  return data as unknown as SettingsExport;
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
