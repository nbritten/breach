import type {
  AgentProvider,
  CiStatus,
  MyPrs,
  RepoSummary,
} from "../types";
import { AGENT_INFO, AGENT_PROVIDER_ORDER } from "./agents";

export type RepoFilter =
  | "dirty"
  | "open-prs"
  | "failing-ci"
  | "behind"
  | "ahead"
  | `agent:${AgentProvider}`;

export const REPO_FILTER_ORDER: RepoFilter[] = [
  "dirty",
  "open-prs",
  "failing-ci",
  "behind",
  "ahead",
  ...AGENT_PROVIDER_ORDER.map((p): RepoFilter => `agent:${p}`),
];

const STATIC_FILTER_LABELS: Record<
  Exclude<RepoFilter, `agent:${AgentProvider}`>,
  string
> = {
  dirty: "Changes",
  "open-prs": "Open PRs",
  "failing-ci": "Failing CI",
  behind: "Behind",
  ahead: "Ahead",
};

export function repoFilterLabel(filter: RepoFilter): string {
  if (filter.startsWith("agent:")) {
    const provider = filter.slice("agent:".length) as AgentProvider;
    return `${AGENT_INFO[provider].label} active`;
  }
  return STATIC_FILTER_LABELS[
    filter as Exclude<RepoFilter, `agent:${AgentProvider}`>
  ];
}

function openPrRepoNames(prs: MyPrs): Set<string> {
  const names = new Set<string>();
  for (const list of Object.values(prs.authored)) {
    for (const pr of list) names.add(pr.repo);
  }
  for (const list of Object.values(prs.review_requested)) {
    for (const pr of list) names.add(pr.repo);
  }
  return names;
}

function matchesFilter(
  repo: RepoSummary,
  filter: RepoFilter,
  prRepos: ReadonlySet<string>,
  ciByPath: Record<string, CiStatus>,
  agents: Record<string, ReadonlySet<AgentProvider>>,
): boolean {
  if (filter.startsWith("agent:")) {
    const provider = filter.slice("agent:".length) as AgentProvider;
    return agents[repo.path]?.has(provider) ?? false;
  }
  switch (filter) {
    case "dirty":
      return repo.dirty;
    case "behind":
      return repo.behind > 0;
    case "ahead":
      return repo.ahead > 0;
    case "open-prs":
      return prRepos.has(repo.name);
    case "failing-ci":
      return ciByPath[repo.path]?.state === "failure";
    default:
      // Unreachable: every non-`agent:` variant of RepoFilter is handled
      // above; the `agent:` variants early-returned at the top of the
      // function. TS can't narrow the template-literal union to know the
      // switch is exhaustive, hence the explicit default.
      return false;
  }
}

/**
 * Filter chips compose with OR semantics: an active set narrows the visible
 * repos to those matching ANY of the chosen filters. An empty active set is a
 * no-op (returns the same reference, like `filterRepos` for an empty query).
 */
export function filterByChips(
  repos: RepoSummary[],
  active: ReadonlySet<RepoFilter>,
  prs: MyPrs,
  ciByPath: Record<string, CiStatus>,
  agents: Record<string, ReadonlySet<AgentProvider>> = {},
): RepoSummary[] {
  if (active.size === 0) return repos;
  const filters = [...active];
  const prRepos = filters.includes("open-prs")
    ? openPrRepoNames(prs)
    : new Set<string>();
  return repos.filter((r) =>
    filters.some((f) => matchesFilter(r, f, prRepos, ciByPath, agents)),
  );
}

/**
 * Count how many repos in `repos` match each filter independently. Used to
 * decide which chips to render (only show chips with count > 0) and to label
 * them with the match count.
 */
export function repoFilterCounts(
  repos: RepoSummary[],
  prs: MyPrs,
  ciByPath: Record<string, CiStatus>,
  agents: Record<string, ReadonlySet<AgentProvider>> = {},
): Record<RepoFilter, number> {
  const counts = Object.fromEntries(
    REPO_FILTER_ORDER.map((f) => [f, 0] as const),
  ) as Record<RepoFilter, number>;
  const prRepos = openPrRepoNames(prs);
  for (const r of repos) {
    if (r.dirty) counts.dirty++;
    if (r.behind > 0) counts.behind++;
    if (r.ahead > 0) counts.ahead++;
    if (prRepos.has(r.name)) counts["open-prs"]++;
    if (ciByPath[r.path]?.state === "failure") counts["failing-ci"]++;
    for (const provider of agents[r.path] ?? []) {
      counts[`agent:${provider}`]++;
    }
  }
  return counts;
}

export interface Section {
  key: string;
  label: string;
  repos: RepoSummary[];
}

/**
 * Filter repos by a free-text query matching name or branch (case-insensitive).
 * Returns the original array reference when the query is blank.
 */
export function filterRepos(repos: RepoSummary[], query: string): RepoSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return repos;
  return repos.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      (r.branch ?? "").toLowerCase().includes(q),
  );
}

/**
 * Group repos into a Pinned section (ordered per `pinnedOrder`) followed by an
 * Other section for the rest. When no repos are pinned, returns a single
 * unlabeled section containing everything — callers can choose not to render
 * a header for that case. Empty Pinned/Other sections are omitted, so callers
 * never have to render a header over an empty grid.
 */
export function groupRepos(
  repos: RepoSummary[],
  pinnedOrder: string[],
): Section[] {
  if (pinnedOrder.length === 0) {
    return [{ key: "__all__", label: "", repos }];
  }
  const pinSet = new Set(pinnedOrder);
  const pinIndex = new Map(pinnedOrder.map((name, index) => [name, index]));
  const pinned = repos.filter((r) => pinSet.has(r.name));
  pinned.sort(
    (a, b) => (pinIndex.get(a.name) ?? 0) - (pinIndex.get(b.name) ?? 0),
  );
  const other = repos.filter((r) => !pinSet.has(r.name));
  const sections: Section[] = [];
  if (pinned.length > 0) {
    sections.push({ key: "__pinned__", label: "Pinned", repos: pinned });
  }
  if (other.length > 0) {
    sections.push({ key: "__other__", label: "Other", repos: other });
  }
  return sections;
}
