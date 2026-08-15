import type {
  AgentSession,
  CiStatus,
  CloneResult,
  CommitInfo,
  DirtyFile,
  MyPrs,
  NotificationPoll,
  RepoSummary,
  SyncResult,
} from "../types";
import {
  demoApplySync,
  demoCiStatus,
  demoMyPrs,
  demoRepoSummaries,
  demoRepoSummary,
  demoSyncAll,
} from "./demoFixtures";

// Latency added to a few calls so the UI behaves like it does in production
// (skeleton states render, spinners flash) — without it, demo mode feels off
// because everything is instantaneous in a way the real app never is.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const demoApi = {
  listRepos: async (
    _reposPath: string,
    _scanNested: boolean,
  ): Promise<RepoSummary[]> => {
    await sleep(120);
    return demoRepoSummaries();
  },
  repoSummary: async (repoPath: string): Promise<RepoSummary> => {
    await sleep(40);
    return demoRepoSummary(repoPath);
  },
  repoDiff: async (_repoPath: string): Promise<string> => "",
  repoLog: async (_repoPath: string, _limit?: number): Promise<CommitInfo[]> =>
    [],
  commitDiff: async (_repoPath: string, _sha: string): Promise<string> => "",
  repoDirtyFiles: async (_repoPath: string): Promise<DirtyFile[]> => [],
  repoStash: async (_repoPath: string): Promise<void> => {},
  repoDiscardAll: async (_repoPath: string): Promise<void> => {},
  repoSyncToDefault: async (
    _repoPath: string,
    _branch: string,
  ): Promise<string> => "synced",
  syncAll: async (
    _reposPath: string,
    _branchOverrides: Record<string, string>,
    _defaultBranch: string,
    onlyRepos: string[],
    _scanNested: boolean,
  ): Promise<SyncResult[]> => {
    await sleep(900);
    const result = demoSyncAll(onlyRepos);
    demoApplySync();
    return result;
  },
  listMissingRepos: async (
    _reposPath: string,
    _orgs: string[],
  ): Promise<string[]> => [],
  cloneRepos: async (
    _reposPath: string,
    _slugs: string[],
  ): Promise<CloneResult[]> => [],
  listMyPrs: async (_orgs: string[]): Promise<MyPrs> => {
    await sleep(80);
    return demoMyPrs();
  },
  ghLogin: async (): Promise<string> => "demo-user",
  pollPrNotifications: async (
    _lastModified: string | null,
  ): Promise<NotificationPoll> => ({
    changed: false,
    last_modified: null,
  }),
  listCiStatus: async (
    repos: { path: string; branch: string }[],
  ): Promise<Record<string, CiStatus>> => {
    await sleep(60);
    return demoCiStatus(repos);
  },
  listActiveAgentSessions: async (
    _repoPaths: string[],
  ): Promise<AgentSession[]> => {
    await sleep(40);
    // Hand-picked: a couple of the curated 10 always look "in active use"
    // during a demo recording so the indicators have a story to tell. The
    // mix shows what multi-agent monitoring will look like at a glance.
    return [
      { provider: "claude", repo_path: "/Users/demo/repos/northstar-api" },
      { provider: "claude", repo_path: "/Users/demo/repos/ml-pipeline" },
      { provider: "codex", repo_path: "/Users/demo/repos/billing-service" },
      { provider: "codex", repo_path: "/Users/demo/repos/customer-portal" },
    ];
  },
  openInTerminal: async (_repoPath: string, _app: string): Promise<string> =>
    "Terminal",
  listTerminalApps: async (): Promise<string[]> => ["Terminal", "iTerm"],
  defaultReposPath: async (): Promise<string> => "/Users/demo/repos",
  homeRelative: async (path: string): Promise<string> =>
    path.replace(/^\/Users\/demo/, "~"),
  // No-op: there's no real filesystem to watch in demo mode.
  startReposWatcher: async (
    _reposPath: string,
    _scanNested: boolean,
  ): Promise<void> => {},
};
