import type {
  CiStatus,
  MyPrs,
  PrInfo,
  RepoSummary,
  SyncResult,
} from "../types";

// All "paths" point at a fake org root. They never hit the filesystem in demo
// mode, so the path doesn't have to exist. Keep them consistent though — the
// dashboard keys repos by path internally.
const DEMO_ROOT = "/Users/demo/repos";
const DEMO_ORG = "northstar-labs";

const now = () => Math.floor(Date.now() / 1000);

interface DemoRepo {
  name: string;
  branch: string;
  dirty: boolean;
  ahead: number;
  behind: number;
  hasUpstream: boolean;
  commitSubject: string;
  commitAuthor: string;
  commitAgoMinutes: number;
}

const REPOS: DemoRepo[] = [
  {
    name: "northstar-web",
    branch: "main",
    dirty: false,
    ahead: 0,
    behind: 0,
    hasUpstream: true,
    commitSubject: "Polish empty-state illustrations",
    commitAuthor: "Priya Shah",
    commitAgoMinutes: 47,
  },
  {
    name: "northstar-api",
    branch: "feat/payments-v2",
    dirty: true,
    ahead: 0,
    behind: 0,
    hasUpstream: true,
    commitSubject: "Wire idempotency keys through the charge handler",
    commitAuthor: "Jordan Reyes",
    commitAgoMinutes: 14,
  },
  {
    name: "billing-service",
    branch: "main",
    dirty: false,
    ahead: 0,
    behind: 2,
    hasUpstream: true,
    commitSubject: "Backfill stripe_customer_id on legacy accounts",
    commitAuthor: "Sam Okafor",
    commitAgoMinutes: 180,
  },
  {
    name: "ml-pipeline",
    branch: "main",
    dirty: false,
    ahead: 1,
    behind: 0,
    hasUpstream: true,
    commitSubject: "Cache feature lookups in the scoring path",
    commitAuthor: "Mei Chen",
    commitAgoMinutes: 25,
  },
  {
    name: "infra-terraform",
    branch: "main",
    dirty: false,
    ahead: 0,
    behind: 0,
    hasUpstream: true,
    commitSubject: "Pin EKS cluster to 1.30",
    commitAuthor: "Devon Park",
    commitAgoMinutes: 1440,
  },
  {
    name: "customer-portal",
    branch: "main",
    dirty: false,
    ahead: 0,
    behind: 0,
    hasUpstream: true,
    commitSubject: "Lift breadcrumb component out of layout",
    commitAuthor: "Priya Shah",
    commitAgoMinutes: 90,
  },
  {
    name: "notifications-worker",
    branch: "main",
    dirty: false,
    ahead: 0,
    behind: 0,
    hasUpstream: true,
    commitSubject: "Retry digest sends with exponential backoff",
    commitAuthor: "Avery Lin",
    commitAgoMinutes: 200,
  },
  {
    name: "data-warehouse",
    branch: "main",
    dirty: true,
    ahead: 0,
    behind: 0,
    hasUpstream: true,
    commitSubject: "Add late-arriving fact partition to revenue model",
    commitAuthor: "Sam Okafor",
    commitAgoMinutes: 60,
  },
  {
    name: "auth-gateway",
    branch: "main",
    dirty: false,
    ahead: 0,
    behind: 0,
    hasUpstream: true,
    commitSubject: "Rotate JWT signing key on schedule",
    commitAuthor: "Devon Park",
    commitAgoMinutes: 720,
  },
  {
    name: "analytics-dashboard",
    branch: "main",
    dirty: false,
    ahead: 0,
    behind: 0,
    hasUpstream: true,
    commitSubject: "Filter funnel chart by acquisition channel",
    commitAuthor: "Mei Chen",
    commitAgoMinutes: 35,
  },
];

const path = (name: string) => `${DEMO_ROOT}/${name}`;
const sha = (i: number) =>
  `${i.toString(16).padStart(2, "0")}f0c4be9d2c1a3e5b7d8c9a0e1f2b3c4d5e6f7a8`;

export function demoRepoSummaries(): RepoSummary[] {
  const t = now();
  return demoCurrentRepos().map((r, i) => ({
    name: r.name,
    path: path(r.name),
    branch: r.branch,
    dirty: r.dirty,
    ahead: r.ahead,
    behind: r.behind,
    has_upstream: r.hasUpstream,
    last_commit: {
      sha: sha(i),
      short_sha: sha(i).slice(0, 7),
      subject: r.commitSubject,
      author: r.commitAuthor,
      timestamp: t - r.commitAgoMinutes * 60,
    },
    error: null,
  }));
}

export function demoRepoSummary(repoPath: string): RepoSummary {
  const summaries = demoRepoSummaries();
  const found = summaries.find((r) => r.path === repoPath);
  if (found) return found;
  return {
    name: repoPath.split("/").pop() ?? "unknown",
    path: repoPath,
    branch: null,
    dirty: false,
    ahead: 0,
    behind: 0,
    has_upstream: false,
    last_commit: null,
    error: null,
  };
}

const PRS_AUTHORED: Record<string, PrInfo[]> = {
  [DEMO_ORG]: [
    {
      number: 412,
      title: "Settle disputes via webhook instead of polling",
      url: `https://github.com/${DEMO_ORG}/customer-portal/pull/412`,
      is_draft: false,
      repo: "customer-portal",
    },
    {
      number: 198,
      title: "Add per-tenant digest preferences",
      url: `https://github.com/${DEMO_ORG}/notifications-worker/pull/198`,
      is_draft: false,
      repo: "notifications-worker",
    },
    {
      number: 87,
      title: "Funnel chart: drill-down by step",
      url: `https://github.com/${DEMO_ORG}/analytics-dashboard/pull/87`,
      is_draft: false,
      repo: "analytics-dashboard",
    },
  ],
};

const PRS_REVIEW_REQUESTED: Record<string, PrInfo[]> = {
  [DEMO_ORG]: [
    {
      number: 88,
      title: "Persist saved filters in URL hash",
      url: `https://github.com/${DEMO_ORG}/analytics-dashboard/pull/88`,
      is_draft: false,
      repo: "analytics-dashboard",
    },
  ],
};

export function demoMyPrs(): MyPrs {
  return {
    authored: PRS_AUTHORED,
    review_requested: PRS_REVIEW_REQUESTED,
    errors: {},
  };
}

export function demoCiStatus(
  repos: { path: string; branch: string }[],
): Record<string, CiStatus> {
  const out: Record<string, CiStatus> = {};
  for (const r of repos) {
    const name = r.path.split("/").pop() ?? "";
    if (name === "customer-portal") {
      out[r.path] = {
        state: "failure",
        conclusion: "failure",
        workflow: "CI",
        url: `https://github.com/${DEMO_ORG}/${name}/actions/runs/9128481`,
      };
    } else if (name === "notifications-worker") {
      out[r.path] = {
        state: "success",
        conclusion: "success",
        workflow: "CI",
        url: `https://github.com/${DEMO_ORG}/${name}/actions/runs/9128202`,
      };
    } else if (name === "analytics-dashboard") {
      out[r.path] = {
        state: "in_progress",
        conclusion: null,
        workflow: "CI",
        url: `https://github.com/${DEMO_ORG}/${name}/actions/runs/9128509`,
      };
    }
    // other repos: no CI entry (omitted, like upstream)
  }
  return out;
}

export function demoSyncAll(reposToSync: string[]): SyncResult[] {
  // Mirror the real backend's behavior: dirty repos report "skipped_dirty",
  // everything else "synced". `behind` counts conceptually go to zero after
  // — handled by re-reading demoRepoSummaries on the next refresh.
  const summaries = demoRepoSummaries();
  return summaries
    .filter((r) => reposToSync.length === 0 || reposToSync.includes(r.name))
    .map((r) => ({
      name: r.name,
      path: r.path,
      status: r.dirty ? ("skipped_dirty" as const) : ("synced" as const),
      branch: r.branch ?? "main",
      error: null,
    }));
}

// 110 fake microservices generated below. These give the dashboard the visual
// density of a real engineering org — pinned hand-crafted repos at the top,
// long-tail microservices below.
const MICROSERVICE_PREFIXES = [
  "payments",
  "billing",
  "notifications",
  "auth",
  "data",
  "events",
  "infra",
  "analytics",
  "ml",
  "search",
  "media",
  "checkout",
  "ledger",
  "audit",
  "internal-tools",
  "growth",
];
const MICROSERVICE_SUFFIXES = [
  "worker",
  "service",
  "router",
  "bridge",
  "handler",
  "ingester",
  "exporter",
  "cron",
  "consumer",
  "api",
  "gateway",
  "scheduler",
  "syncer",
  "rotator",
  "indexer",
  "reporter",
];
const MICROSERVICE_QUALIFIERS = [
  "stripe",
  "internal",
  "v2",
  "legacy",
  "edge",
  "core",
  "shadow",
  "mobile",
  "web",
  "kafka",
  "redis",
  "s3",
  "sqs",
  "grpc",
  "ws",
];

// A fixed list of authors for last-commit messages on the microservices, so
// the dashboard looks populated by humans rather than a single committer.
const AUTHORS = [
  "Priya Shah",
  "Jordan Reyes",
  "Sam Okafor",
  "Mei Chen",
  "Devon Park",
  "Avery Lin",
  "Ren Nakamura",
  "Yusuf Hassan",
  "Camille Petit",
  "Theo Larsen",
];

// Deterministic so the demo looks identical run-to-run. Mulberry32 is plenty
// for picking from short lists.
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateMicroservices(count: number): DemoRepo[] {
  const rand = mulberry32(0xb12a4c11);
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const seen = new Set<string>();
  const repos: DemoRepo[] = [];
  let attempts = 0;
  while (repos.length < count && attempts < count * 10) {
    attempts++;
    const prefix = pick(MICROSERVICE_PREFIXES);
    const qualifier = rand() < 0.45 ? `-${pick(MICROSERVICE_QUALIFIERS)}` : "";
    const suffix = pick(MICROSERVICE_SUFFIXES);
    const name = `${prefix}${qualifier}-${suffix}`;
    if (seen.has(name)) continue;
    seen.add(name);
    repos.push({
      name,
      branch: "main",
      dirty: rand() < 0.04,
      ahead: 0,
      behind: 0,
      hasUpstream: true,
      commitSubject: pick([
        "Bump dependency",
        "Add metric for retry budget",
        "Lift config into env",
        "Drop dead feature flag",
        "Tighten timeout on outbound calls",
        "Backfill nullable column",
        "Switch logger to structured output",
        "Cache hot path in process",
        "Smaller batch size in producer",
        "Rename internal helper",
      ]),
      commitAuthor: pick(AUTHORS),
      commitAgoMinutes: Math.floor(rand() * 60 * 24 * 30) + 30, // 30min — 30 days
    });
  }
  return repos;
}

const MICROSERVICES: DemoRepo[] = generateMicroservices(110);
const ALL_REPOS: DemoRepo[] = [...REPOS, ...MICROSERVICES];

// Names of the repos that should appear in the "Pinned" section in demo mode
// on first load. The hand-curated 10 — the microservices fill the long tail
// below. Users can pin/unpin during the demo and those changes persist in
// memory (see mutablePinned below) until demo mode is turned off.
const DEFAULT_DEMO_PINNED: string[] = REPOS.map((r) => r.name);

let mutablePinned: string[] | null = null;

export function getDemoPinnedRepos(): string[] {
  return mutablePinned ?? DEFAULT_DEMO_PINNED;
}

export function setDemoPinnedRepos(pins: string[]): void {
  mutablePinned = pins;
}

// Mutated by demoApplySync so a refresh after sync reflects the new state
// (the `behind` repo goes to up-to-date). Reset on demoReset (called when the
// toggle is turned off, so the next demo session starts fresh).
let mutableState: DemoRepo[] | null = null;

function demoCurrentRepos(): DemoRepo[] {
  return mutableState ?? ALL_REPOS;
}

export function demoApplySync(): void {
  mutableState = (mutableState ?? REPOS).map((r) =>
    r.dirty ? r : { ...r, behind: 0 },
  );
}

export function demoReset(): void {
  mutableState = null;
  mutablePinned = null;
}
