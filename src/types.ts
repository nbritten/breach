export interface CommitInfo {
  sha: string;
  short_sha: string;
  subject: string;
  author: string;
  timestamp: number;
}

export interface SyncResult {
  name: string;
  path: string;
  status: "synced" | "skipped_dirty" | "error";
  branch: string;
  error: string | null;
}

export interface CiStatus {
  state: "success" | "failure" | "in_progress" | "other";
  conclusion: string | null;
  workflow: string | null;
  url: string | null;
}

export interface PrInfo {
  number: number;
  title: string;
  url: string;
  is_draft: boolean;
  repo: string;
}

export interface MyPrs {
  authored: Record<string, PrInfo[]>;
  review_requested: Record<string, PrInfo[]>;
  errors: Record<string, string>;
}

export interface CloneResult {
  slug: string;
  name: string;
  path: string;
  status: "cloned" | "exists" | "error";
  error: string | null;
}

export interface DirtyFile {
  path: string;
  index_status: string;
  work_status: string;
}

export interface RepoSummary {
  name: string;
  path: string;
  branch: string | null;
  dirty: boolean;
  ahead: number;
  behind: number;
  has_upstream: boolean;
  last_commit: CommitInfo | null;
  error: string | null;
}
