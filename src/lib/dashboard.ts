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

/**
 * True if `name` shows up as the `repo` field of any PR the user authored
 * or was requested as a reviewer on. Linear scan — PR lists are small.
 */
function hasOpenPr(name: string, prs: MyPrs): boolean {
  for (const list of Object.values(prs.authored)) {
    if (list.some((p) => p.repo === name)) return true;
  }
  for (const list of Object.values(prs.review_requested)) {
    if (list.some((p) => p.repo === name)) return true;
  }
  return false;
}

function matchesFilter(
  repo: RepoSummary,
  filter: RepoFilter,
  prs: MyPrs,
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
      return hasOpenPr(repo.name, prs);
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
  return repos.filter((r) =>
    [...active].some((f) => matchesFilter(r, f, prs, ciByPath, agents)),
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
  for (const r of repos) {
    for (const f of REPO_FILTER_ORDER) {
      if (matchesFilter(r, f, prs, ciByPath, agents)) counts[f]++;
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
 * Pin identity for a repo. Basename is used when it's unique among `repos`
 * (matches typed Settings pins and the historical `pinnedRepos` values).
 * When two checkouts share a directory name — the nested-scan case — the
 * full path is the key so pinning one does not pin the other.
 */
export function repoPinKey(
  repo: RepoSummary,
  repos: readonly RepoSummary[],
): string {
  const clash = repos.some((r) => r.name === repo.name && r.path !== repo.path);
  return clash ? repo.path : repo.name;
}

export function isRepoPinned(
  repo: RepoSummary,
  pinnedOrder: readonly string[],
): boolean {
  return pinnedOrder.some((p) => p === repo.path || p === repo.name);
}

function pinIndex(repo: RepoSummary, pinnedOrder: readonly string[]): number {
  const byPath = pinnedOrder.indexOf(repo.path);
  if (byPath >= 0) return byPath;
  return pinnedOrder.indexOf(repo.name);
}

/**
 * Dashboard ordering. Grouped mode sorts by path so a nested checkout sits
 * next to its parent (`project`, then `project/frontend`) instead of in a
 * basename pile (`frontend`, `frontend`, `project`). Ungrouped mode is the
 * historical sort: basename, with path as a tie-breaker so name clashes
 * stay stable.
 */
export function sortRepos(
  repos: RepoSummary[],
  groupNested: boolean,
): RepoSummary[] {
  const copy = [...repos];
  if (groupNested) {
    copy.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  } else {
    copy.sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) return byName;
      return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
    });
  }
  return copy;
}

/**
 * Group repos into a Pinned section (ordered per `pinnedOrder`) followed by an
 * Other section for the rest. When no repos are pinned, returns a single
 * unlabeled section containing everything — callers can choose not to render
 * a header for that case. Empty Pinned/Other sections are omitted, so callers
 * never have to render a header over an empty grid.
 *
 * Pins match either `name` or `path` so a path-keyed pin from a name clash
 * doesn't also require the basename, and a legacy name pin still works when
 * the basename is unique.
 */
export function groupRepos(
  repos: RepoSummary[],
  pinnedOrder: string[],
): Section[] {
  if (pinnedOrder.length === 0) {
    return [{ key: "__all__", label: "", repos }];
  }
  const pinned = repos.filter((r) => isRepoPinned(r, pinnedOrder));
  pinned.sort((a, b) => pinIndex(a, pinnedOrder) - pinIndex(b, pinnedOrder));
  const other = repos.filter((r) => !isRepoPinned(r, pinnedOrder));
  const sections: Section[] = [];
  if (pinned.length > 0) {
    sections.push({ key: "__pinned__", label: "Pinned", repos: pinned });
  }
  if (other.length > 0) {
    sections.push({ key: "__other__", label: "Other", repos: other });
  }
  return sections;
}
