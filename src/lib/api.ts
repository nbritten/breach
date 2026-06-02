import { invoke } from "@tauri-apps/api/core";
import type {
  CiStatus,
  CloneResult,
  CommitInfo,
  DirtyFile,
  MyPrs,
  NotificationPoll,
  RepoSummary,
  SyncResult,
} from "../types";
import { demoApi } from "./demoApi";

// Demo mode flips this flag at runtime via setDemoModeActive. Settings reads
// the persisted value on launch and calls in; the toggle calls in on change.
// We keep this module-level rather than per-call so we don't have to thread an
// `isDemo` parameter through every call site or wrap every component in a
// context. Call sites still look like normal async calls.
let demoActive = false;

export function setDemoModeActive(active: boolean): void {
  demoActive = active;
}

const real = {
  listRepos: (reposPath: string) =>
    invoke<RepoSummary[]>("list_repos", { reposPath }),
  repoSummary: (repoPath: string) =>
    invoke<RepoSummary>("repo_summary", { repoPath }),
  repoDiff: (repoPath: string) =>
    invoke<string>("repo_diff", { repoPath }),
  repoLog: (repoPath: string, limit?: number) =>
    invoke<CommitInfo[]>("repo_log", { repoPath, limit }),
  commitDiff: (repoPath: string, sha: string) =>
    invoke<string>("commit_diff", { repoPath, sha }),
  repoDirtyFiles: (repoPath: string) =>
    invoke<DirtyFile[]>("repo_dirty_files", { repoPath }),
  repoStash: (repoPath: string) =>
    invoke<void>("repo_stash", { repoPath }),
  repoDiscardAll: (repoPath: string) =>
    invoke<void>("repo_discard_all", { repoPath }),
  repoSyncToDefault: (repoPath: string, branch: string) =>
    invoke<string>("repo_sync_to_default", { repoPath, branch }),
  syncAll: (
    reposPath: string,
    branchOverrides: Record<string, string>,
    defaultBranch: string,
    onlyRepos: string[],
  ) =>
    invoke<SyncResult[]>("sync_all", {
      reposPath,
      branchOverrides,
      defaultBranch,
      onlyRepos,
    }),
  listMissingRepos: (reposPath: string, orgs: string[]) =>
    invoke<string[]>("list_missing_repos", { reposPath, orgs }),
  cloneRepos: (reposPath: string, slugs: string[]) =>
    invoke<CloneResult[]>("clone_repos", { reposPath, slugs }),
  listMyPrs: (orgs: string[]) => invoke<MyPrs>("list_my_prs", { orgs }),
  ghLogin: () => invoke<string>("gh_login"),
  pollPrNotifications: (lastModified: string | null) =>
    invoke<NotificationPoll>("pr_notifications_changed", { lastModified }),
  listCiStatus: (repos: { path: string; branch: string }[]) =>
    invoke<Record<string, CiStatus>>("list_ci_status", { repos }),
  openInTerminal: (repoPath: string, app: string) =>
    invoke<string>("open_in_terminal", { repoPath, app }),
  listTerminalApps: () => invoke<string[]>("list_terminal_apps"),
  defaultReposPath: () => invoke<string>("default_repos_path"),
  homeRelative: (path: string) => invoke<string>("home_relative", { path }),
  startReposWatcher: (reposPath: string) =>
    invoke<void>("start_repos_watcher", { reposPath }),
};

type Api = typeof real;

// Pick the active implementation lazily per-call so flipping the demo toggle
// doesn't require restarting the app.
function pick<K extends keyof Api>(key: K): Api[K] {
  return (demoActive ? (demoApi as unknown as Api) : real)[key];
}

export const api: Api = new Proxy(real, {
  get(_target, prop: string) {
    return pick(prop as keyof Api);
  },
});
