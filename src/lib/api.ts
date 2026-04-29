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

export const api = {
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
  cloneMissing: (reposPath: string, orgs: string[], onlyRepos: string[]) =>
    invoke<CloneResult[]>("clone_missing", { reposPath, orgs, onlyRepos }),
  listMyPrs: (orgs: string[]) => invoke<MyPrs>("list_my_prs", { orgs }),
  pollPrNotifications: (lastModified: string | null) =>
    invoke<NotificationPoll>("pr_notifications_changed", { lastModified }),
  listCiStatus: (repos: { path: string; branch: string }[]) =>
    invoke<Record<string, CiStatus>>("list_ci_status", { repos }),
  openInTerminal: (repoPath: string) =>
    invoke<string>("open_in_terminal", { repoPath }),
  defaultReposPath: () => invoke<string>("default_repos_path"),
  homeRelative: (path: string) => invoke<string>("home_relative", { path }),
};
