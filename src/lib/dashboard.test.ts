import { describe, expect, it } from "vitest";
import { filterRepos, groupRepos } from "./dashboard";
import type { RepoSummary } from "../types";

function repo(name: string, branch: string | null = "main"): RepoSummary {
  return {
    name,
    path: `/repos/${name}`,
    branch,
    dirty: false,
    ahead: 0,
    behind: 0,
    has_upstream: true,
    last_commit: null,
    error: null,
  };
}

describe("filterRepos", () => {
  const repos = [repo("alpha"), repo("beta-service"), repo("gamma", "feature")];

  it("returns all repos when query is blank", () => {
    expect(filterRepos(repos, "")).toBe(repos);
    expect(filterRepos(repos, "   ")).toBe(repos);
  });

  it("matches by name case-insensitively", () => {
    expect(filterRepos(repos, "BETA").map((r) => r.name)).toEqual([
      "beta-service",
    ]);
  });

  it("matches by branch", () => {
    expect(filterRepos(repos, "feat").map((r) => r.name)).toEqual(["gamma"]);
  });

  it("handles null branch without throwing", () => {
    const withNull = [...repos, repo("delta", null)];
    expect(filterRepos(withNull, "delta").map((r) => r.name)).toEqual(["delta"]);
  });

  it("returns empty when nothing matches", () => {
    expect(filterRepos(repos, "zzz")).toEqual([]);
  });
});

describe("groupRepos", () => {
  const repos = [repo("a"), repo("b"), repo("c"), repo("d")];

  it("returns a single unlabeled section when no pins", () => {
    const sections = groupRepos(repos, []);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("__all__");
    expect(sections[0].label).toBe("");
    expect(sections[0].repos.map((r) => r.name)).toEqual(["a", "b", "c", "d"]);
  });

  it("splits into pinned + other when pins are set", () => {
    const sections = groupRepos(repos, ["b", "d"]);
    expect(sections.map((s) => s.key)).toEqual(["__pinned__", "__other__"]);
    expect(sections[0].repos.map((r) => r.name)).toEqual(["b", "d"]);
    expect(sections[1].repos.map((r) => r.name)).toEqual(["a", "c"]);
  });

  it("respects pinnedOrder", () => {
    const sections = groupRepos(repos, ["d", "a"]);
    expect(sections[0].repos.map((r) => r.name)).toEqual(["d", "a"]);
  });

  it("omits pinned section when no local repos match", () => {
    const sections = groupRepos(repos, ["zzz"]);
    // pinnedOrder is set but no repo matches → pinned section skipped
    expect(sections.map((s) => s.key)).toEqual(["__other__"]);
  });

  it("produces empty other when all repos are pinned", () => {
    const sections = groupRepos(repos, ["a", "b", "c", "d"]);
    expect(sections).toHaveLength(2);
    expect(sections[0].repos.map((r) => r.name)).toEqual(["a", "b", "c", "d"]);
    expect(sections[1].repos).toEqual([]);
  });
});
