import type {
  AgentProvider,
  CiStatus,
  MyPrs,
  PrInfo,
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
 * True if this checkout has an open PR the user authored or was asked to
 * review. Prefers `origin_slug` so two local `frontend` folders that are
 * different GitHub repos do not share badges. Falls back to basename when
 * there is no remote (tests, missing origin).
 */
function openPrRepoKeys(prs: MyPrs): Set<string> {
  const names = new Set<string>();
  for (const [key, list] of Object.entries(prs.authored)) {
    names.add(key);
    for (const pr of list) names.add(pr.repo);
  }
  for (const [key, list] of Object.entries(prs.review_requested)) {
    names.add(key);
    for (const pr of list) names.add(pr.repo);
  }
  return names;
}

/** PRs attached to this checkout: slug map first, then basename for demos. */
export function prsForRepo(
  repo: RepoSummary,
  bucket: Record<string, PrInfo[]>,
): PrInfo[] {
  if (repo.origin_slug && bucket[repo.origin_slug]) {
    return bucket[repo.origin_slug];
  }
  return bucket[repo.name] ?? [];
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
      return repo.origin_slug
        ? prRepos.has(repo.origin_slug)
        : prRepos.has(repo.name);
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
    ? openPrRepoKeys(prs)
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
  const prRepos = openPrRepoKeys(prs);
  for (const r of repos) {
    if (r.dirty) counts.dirty++;
    if (r.behind > 0) counts.behind++;
    if (r.ahead > 0) counts.ahead++;
    if (r.origin_slug ? prRepos.has(r.origin_slug) : prRepos.has(r.name)) {
      counts["open-prs"]++;
    }
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
 * Filter repos by a free-text query matching name, path, or branch
 * (case-insensitive). Returns the original array reference when the query
 * is blank.
 */
export function filterRepos(repos: RepoSummary[], query: string): RepoSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return repos;
  return repos.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.path.toLowerCase().includes(q) ||
      (r.branch ?? "").toLowerCase().includes(q),
  );
}

/**
 * Short path shown on a card when two checkouts share a basename.
 * Picks the shortest trailing suffix that is unique among `repos`
 * (at least `parent/name`). Null when the basename is already unique.
 */
export function repoPathLabel(
  repo: RepoSummary,
  repos: readonly RepoSummary[],
): string | null {
  if (!namesClash(repo, repos)) return null;
  const parts = pathParts(repo.path);
  for (let n = 2; n <= parts.length; n++) {
    const label = parts.slice(-n).join("/");
    const clash = repos.some(
      (r) => r.path !== repo.path && pathTail(r.path, n) === label,
    );
    if (!clash) return label;
  }
  return repo.path.replace(/\\/g, "/");
}

function pathParts(path: string): string[] {
  return path.split(/[/\\]/).filter((p) => p.length > 0);
}

function pathTail(path: string, n: number): string {
  return pathParts(path).slice(-n).join("/");
}

function namesClash(
  repo: RepoSummary,
  repos: readonly RepoSummary[],
): boolean {
  return repos.some((r) => r.name === repo.name && r.path !== repo.path);
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
  return namesClash(repo, repos) ? repo.path : repo.name;
}

/**
 * True when `keys` identifies `repo`. A path key always matches that
 * checkout. A basename key matches only when the name is unique among
 * `repos` — otherwise a leftover `frontend` pin would light up every
 * nested frontend.
 */
export function matchesIdentityKey(
  repo: RepoSummary,
  keys: readonly string[],
  repos: readonly RepoSummary[],
): boolean {
  if (keys.includes(repo.path)) return true;
  if (namesClash(repo, repos)) return false;
  return keys.includes(repo.name);
}

export function isRepoPinned(
  repo: RepoSummary,
  pinnedOrder: readonly string[],
  repos: readonly RepoSummary[],
): boolean {
  return matchesIdentityKey(repo, pinnedOrder, repos);
}

/**
 * Pin or unpin `repo`. Unpin drops both the basename and the path so a
 * leftover name pin cannot keep the card stuck after a clash appears.
 */
export function togglePinnedOrder(
  repo: RepoSummary,
  repos: readonly RepoSummary[],
  pinnedOrder: readonly string[],
): string[] {
  if (isRepoPinned(repo, pinnedOrder, repos)) {
    return pinnedOrder.filter((p) => p !== repo.name && p !== repo.path);
  }
  // A leftover basename pin is ambiguous once names clash — drop it so
  // pinning one checkout doesn't leave a zombie `frontend` entry.
  const rest = namesClash(repo, repos)
    ? pinnedOrder.filter((p) => p !== repo.name)
    : [...pinnedOrder];
  return [...rest, repoPinKey(repo, repos)];
}

function pinIndex(
  repo: RepoSummary,
  pinnedOrder: readonly string[],
  repos: readonly RepoSummary[],
): number {
  const byPath = pinnedOrder.indexOf(repo.path);
  if (byPath >= 0) return byPath;
  if (namesClash(repo, repos)) return -1;
  return pinnedOrder.indexOf(repo.name);
}

/**
 * Dashboard ordering. Grouped mode sorts by path *components* so a nested
 * checkout sits next to its parent (`project`, then `project/frontend`)
 * instead of in a basename pile, and so a sibling like `acme-tools` cannot
 * sort between `acme` and `acme/frontend` the way a raw string sort would.
 * Ungrouped mode is the historical sort: basename, with path as a
 * tie-breaker so name clashes stay stable.
 */
export function sortRepos(
  repos: RepoSummary[],
  groupNested: boolean,
): RepoSummary[] {
  const copy = [...repos];
  if (groupNested) {
    copy.sort((a, b) => comparePathTree(a.path, b.path));
  } else {
    copy.sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) return byName;
      return comparePathTree(a.path, b.path);
    });
  }
  return copy;
}

function comparePathTree(a: string, b: string): number {
  const as = pathParts(a);
  const bs = pathParts(b);
  const n = Math.min(as.length, bs.length);
  for (let i = 0; i < n; i++) {
    if (as[i] === bs[i]) continue;
    return as[i] < bs[i] ? -1 : 1;
  }
  return as.length - bs.length;
}

/**
 * Group repos into a Pinned section (ordered per `pinnedOrder`) followed by an
 * Other section for the rest. When no repos are pinned, returns a single
 * unlabeled section containing everything — callers can choose not to render
 * a header for that case. Empty Pinned/Other sections are omitted, so callers
 * never have to render a header over an empty grid.
 *
 * Pins match a path always, and a basename only when that name is unique
 * in `allRepos` (the unfiltered list). Pass `allRepos` when `repos` is a
 * search/chip slice so a hidden sibling still counts as a name clash.
 */
export function groupRepos(
  repos: RepoSummary[],
  pinnedOrder: string[],
  allRepos: readonly RepoSummary[] = repos,
): Section[] {
  if (pinnedOrder.length === 0) {
    return [{ key: "__all__", label: "", repos }];
  }
  const pinned = repos.filter((r) => isRepoPinned(r, pinnedOrder, allRepos));
  pinned.sort(
    (a, b) =>
      pinIndex(a, pinnedOrder, allRepos) - pinIndex(b, pinnedOrder, allRepos),
  );
  const other = repos.filter((r) => !isRepoPinned(r, pinnedOrder, allRepos));
  const sections: Section[] = [];
  if (pinned.length > 0) {
    sections.push({ key: "__pinned__", label: "Pinned", repos: pinned });
  }
  if (other.length > 0) {
    sections.push({ key: "__other__", label: "Other", repos: other });
  }
  return sections;
}
