import { describe, expect, it } from "vitest";
import {
  filterByChips,
  filterRepos,
  groupRepos,
  repoFilterCounts,
  type RepoFilter,
} from "./dashboard";
import type { CiStatus, MyPrs, RepoSummary } from "../types";

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

  it("omits other section when all repos are pinned", () => {
    const sections = groupRepos(repos, ["a", "b", "c", "d"]);
    expect(sections.map((s) => s.key)).toEqual(["__pinned__"]);
    expect(sections[0].repos.map((r) => r.name)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("filterByChips and repoFilterCounts", () => {
  const dirtyRepo = { ...repo("alpha"), dirty: true };
  const behindRepo = { ...repo("beta"), behind: 3 };
  const aheadRepo = { ...repo("gamma"), ahead: 1 };
  const cleanRepo = repo("delta");
  const repos = [dirtyRepo, behindRepo, aheadRepo, cleanRepo];

  const emptyPrs: MyPrs = { authored: {}, review_requested: {}, errors: {} };
  const prsForBeta: MyPrs = {
    authored: {
      acme: [
        { number: 1, title: "x", url: "u", is_draft: false, repo: "beta" },
      ],
    },
    review_requested: {},
    errors: {},
  };

  const ciFailedAlpha: Record<string, CiStatus> = {
    "/repos/alpha": {
      state: "failure",
      conclusion: "failure",
      workflow: "CI",
      url: null,
    },
  };

  it("returns the same array when no filters are active", () => {
    const active = new Set<RepoFilter>();
    expect(filterByChips(repos, active, emptyPrs, {})).toBe(repos);
  });

  it("filters by dirty state", () => {
    const active = new Set<RepoFilter>(["dirty"]);
    expect(
      filterByChips(repos, active, emptyPrs, {}).map((r) => r.name),
    ).toEqual(["alpha"]);
  });

  it("ORs multiple active filters", () => {
    const active = new Set<RepoFilter>(["dirty", "behind"]);
    expect(
      filterByChips(repos, active, emptyPrs, {}).map((r) => r.name),
    ).toEqual(["alpha", "beta"]);
  });

  it("matches open-prs filter via authored PRs", () => {
    const active = new Set<RepoFilter>(["open-prs"]);
    expect(
      filterByChips(repos, active, prsForBeta, {}).map((r) => r.name),
    ).toEqual(["beta"]);
  });

  it("matches failing-ci filter via ciByPath", () => {
    const active = new Set<RepoFilter>(["failing-ci"]);
    expect(
      filterByChips(repos, active, emptyPrs, ciFailedAlpha).map((r) => r.name),
    ).toEqual(["alpha"]);
  });

  it("counts each dimension independently", () => {
    const counts = repoFilterCounts(repos, prsForBeta, ciFailedAlpha);
    expect(counts).toEqual({
      dirty: 1,
      behind: 1,
      ahead: 1,
      "open-prs": 1,
      "failing-ci": 1,
      "agent:claude": 0,
      "agent:codex": 0,
    });
  });

  it("matches per-provider agent filters via the agents-by-repo map", () => {
    const claudeOnly = new Set<RepoFilter>(["agent:claude"]);
    const agents = {
      "/repos/alpha": new Set<"claude" | "codex">(["claude"]),
      "/repos/beta": new Set<"claude" | "codex">(["codex"]),
      "/repos/delta": new Set<"claude" | "codex">(["claude", "codex"]),
    };
    expect(
      filterByChips(repos, claudeOnly, emptyPrs, {}, agents).map((r) => r.name),
    ).toEqual(["alpha", "delta"]);
  });

  it("counts agent filters per provider", () => {
    const agents = {
      "/repos/alpha": new Set<"claude" | "codex">(["claude"]),
      "/repos/beta": new Set<"claude" | "codex">(["codex"]),
      "/repos/gamma": new Set<"claude" | "codex">(["claude", "codex"]),
    };
    const counts = repoFilterCounts(repos, emptyPrs, {}, agents);
    expect(counts["agent:claude"]).toBe(2);
    expect(counts["agent:codex"]).toBe(2);
  });

  it("counts a repo against multiple dimensions if it matches multiple", () => {
    const messy = [
      { ...repo("messy"), dirty: true, behind: 2, ahead: 3 },
    ];
    const counts = repoFilterCounts(messy, emptyPrs, {});
    expect(counts.dirty).toBe(1);
    expect(counts.behind).toBe(1);
    expect(counts.ahead).toBe(1);
  });
});
