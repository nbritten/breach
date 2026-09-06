import { invoke } from "@tauri-apps/api/core";
import { isDemoModeActive } from "./api";
import { demoGitHub } from "./githubDemo";

export type Inbox = "review" | "authored" | "involved" | "search";
export interface GitHubUser {
  login: string;
}
export interface PullSummary {
  number: number;
  title: string;
  html_url: string;
  repository_url: string;
  user: GitHubUser;
  updated_at: string;
  state: string;
  draft?: boolean;
  labels: { name: string }[];
}
export interface SearchResults {
  items: PullSummary[];
  total_count: number;
  incomplete_results: boolean;
  login: string;
}
export interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  user: GitHubUser;
  state: string;
  draft: boolean;
  merged: boolean;
  head: { sha: string; label: string };
  base: { label: string };
  additions: number;
  deletions: number;
  changed_files: number;
  mergeable: boolean | null;
  mergeable_state: string;
}
export interface CheckRun {
  name?: string;
  context?: string;
  status?: string;
  state?: string;
  conclusion?: string | null;
  detailsUrl?: string;
  targetUrl?: string;
}
export interface PullDetail {
  pr: PullRequest;
  viewer: string;
  repository: {
    permissions?: { push?: boolean };
    allow_merge_commit?: boolean;
    allow_squash_merge?: boolean;
    allow_rebase_merge?: boolean;
  };
  checks: {
    reviewDecision: string | null;
    statusCheckRollup: CheckRun[] | null;
  };
}
export interface DiscussionEntry {
  id: number;
  user: GitHubUser | null;
  body: string;
  created_at?: string;
  submitted_at?: string;
  state?: string;
  path?: string;
  line?: number | null;
  original_line?: number;
  in_reply_to_id?: number;
  diff_hunk?: string;
}
export interface Conversation {
  comments: DiscussionEntry[];
  reviews: DiscussionEntry[];
  inline: DiscussionEntry[];
}
export interface PullFile {
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}
export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
export type MergeMethod = "merge" | "squash" | "rebase";
export type PrAction =
  | { kind: "comment"; body: string }
  | { kind: "review"; body: string; event: ReviewEvent; sha: string }
  | {
      kind: "inline";
      body: string;
      sha: string;
      path: string;
      line: number;
      side: "LEFT" | "RIGHT";
    }
  | { kind: "reply"; body: string; comment_id: number }
  | { kind: "merge"; sha: string; method: MergeMethod };

export const github = {
  search: (
    queue: Inbox,
    query: string,
    page: number,
  ): Promise<SearchResults> =>
    isDemoModeActive()
      ? Promise.resolve(demoGitHub.search(queue, query, page))
      : invoke("github_search", { queue, query, page }),
  detail: (repo: string, number: number): Promise<PullDetail> =>
    isDemoModeActive()
      ? Promise.resolve(demoGitHub.detail(repo, number))
      : invoke("github_detail", { repo, number }),
  conversation: (repo: string, number: number): Promise<Conversation> =>
    isDemoModeActive()
      ? Promise.resolve(demoGitHub.conversation())
      : invoke("github_conversation", { repo, number }),
  files: (repo: string, number: number, sha: string): Promise<PullFile[]> =>
    isDemoModeActive()
      ? Promise.resolve(demoGitHub.files())
      : invoke("github_files", { repo, number, sha }),
  action: (repo: string, number: number, action: PrAction): Promise<unknown> =>
    isDemoModeActive()
      ? Promise.reject(
          new Error(
            "Demo workspace is read-only. Turn off demo mode to use your GitHub account.",
          ),
        )
      : invoke("github_action", { repo, number, action }),
};
export function repositoryOf(pr: PullSummary): string {
  return pr.repository_url.replace("https://api.github.com/repos/", "");
}
export function pullRoute(repo: string, number: number): string {
  return `/github/${repo.split("/").map(encodeURIComponent).join("/")}/pull/${number}`;
}
export function parsePullUrl(value: string): string | null {
  const match =
    /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/.exec(
      value.trim(),
    );
  return match && Number(match[3]) > 0
    ? pullRoute(`${match[1]}/${match[2]}`, Number(match[3]))
    : null;
}
export function checkState(
  check: CheckRun,
): "passed" | "failed" | "pending" | "neutral" {
  const state = (
    check.conclusion ||
    check.state ||
    check.status ||
    ""
  ).toUpperCase();
  if (["SUCCESS", "SUCCESSFUL"].includes(state)) return "passed";
  if (
    [
      "FAILURE",
      "ERROR",
      "TIMED_OUT",
      "CANCELLED",
      "ACTION_REQUIRED",
      "STARTUP_FAILURE",
      "STALE",
    ].includes(state)
  )
    return "failed";
  if (["NEUTRAL", "SKIPPED"].includes(state)) return "neutral";
  return "pending";
}
export function mergeBlock(detail: PullDetail): string | null {
  if (detail.pr.merged) return "This pull request has been merged.";
  if (detail.pr.state !== "open") return "This pull request is closed.";
  if (detail.pr.draft) return "This pull request is still a draft.";
  if (!detail.repository.permissions?.push)
    return "You do not have permission to merge this pull request.";
  if (detail.pr.mergeable === false)
    return "Merge conflicts need to be resolved.";
  if (detail.pr.mergeable === null || detail.pr.mergeable_state === "unknown")
    return "GitHub is calculating mergeability. Refresh in a moment.";
  if (["blocked", "behind", "dirty"].includes(detail.pr.mergeable_state))
    return "GitHub requirements must be satisfied before merging.";
  return null;
}
