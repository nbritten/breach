import type { CiStatus, MyPrs, RepoSummary } from "../types";

export type RepoFilter = "dirty" | "open-prs" | "failing-ci" | "behind" | "ahead";

export const REPO_FILTER_ORDER: RepoFilter[] = [
  "dirty",
  "open-prs",
  "failing-ci",
  "behind",
  "ahead",
];

export const REPO_FILTER_LABELS: Record<RepoFilter, string> = {
  dirty: "Dirty",
  "open-prs": "Open PRs",
  "failing-ci": "Failing CI",
  behind: "Behind",
  ahead: "Ahead",
};

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
): boolean {
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
): RepoSummary[] {
  if (active.size === 0) return repos;
  return repos.filter((r) =>
    [...active].some((f) => matchesFilter(r, f, prs, ciByPath)),
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
): Record<RepoFilter, number> {
  const counts: Record<RepoFilter, number> = {
    dirty: 0,
    "open-prs": 0,
    "failing-ci": 0,
    behind: 0,
    ahead: 0,
  };
  for (const r of repos) {
    for (const f of REPO_FILTER_ORDER) {
      if (matchesFilter(r, f, prs, ciByPath)) counts[f]++;
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
  const pinned = repos.filter((r) => pinSet.has(r.name));
  pinned.sort(
    (a, b) => pinnedOrder.indexOf(a.name) - pinnedOrder.indexOf(b.name),
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
