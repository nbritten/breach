import type { RepoSummary } from "../types";

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
 * a header for that case.
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
  sections.push({ key: "__other__", label: "Other", repos: other });
  return sections;
}
