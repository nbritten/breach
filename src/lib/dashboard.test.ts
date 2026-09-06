import { describe, expect, it } from "vitest";
import {
  filterByChips,
  filterRepos,
  groupRepos,
  isRepoPinned,
  repoPinKey,
  repoPathLabel,
  sortRepos,
  togglePinnedOrder,
  repoFilterCounts,
  prsForRepo,
  type RepoFilter,
} from "./dashboard";
import type { CiStatus, MyPrs, RepoSummary } from "../types";

function repo(
  name: string,
  branch: string | null = "main",
  path?: string,
): RepoSummary {
  return {
    name,
    path: path ?? `/repos/${name}`,
    branch,
    dirty: false,
    ahead: 0,
    behind: 0,
    has_upstream: true,
    last_commit: null,
    error: null,
    origin_slug: null,
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

  it("matches by path so nested parents are searchable", () => {
    const nested = [
      repo("frontend", "main", "/dev/acme/frontend"),
      repo("frontend", "main", "/dev/beta/frontend"),
    ];
    expect(filterRepos(nested, "acme").map((r) => r.path)).toEqual([
      "/dev/acme/frontend",
    ]);
  });
});

describe("repoPathLabel", () => {
  const acme = repo("frontend", "main", "/dev/acme/frontend");
  const beta = repo("frontend", "main", "/dev/beta/frontend");
  const unique = repo("api", "main", "/dev/api");

  it("is null when the basename is unique", () => {
    expect(repoPathLabel(unique, [acme, unique])).toBeNull();
  });

  it("shows parent/name when two checkouts share a basename", () => {
    expect(repoPathLabel(acme, [acme, beta])).toBe("acme/frontend");
    expect(repoPathLabel(beta, [acme, beta])).toBe("beta/frontend");
  });

  it("lengthens the suffix when parent/name still clashes", () => {
    const a = repo("frontend", "main", "/work/org/app/frontend");
    const b = repo("frontend", "main", "/work/other/app/frontend");
    expect(repoPathLabel(a, [a, b])).toBe("org/app/frontend");
    expect(repoPathLabel(b, [a, b])).toBe("other/app/frontend");
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

  it("pins only the matching checkout when two repos share a basename", () => {
    const acme = repo("frontend", "main", "/dev/acme/frontend");
    const beta = repo("frontend", "main", "/dev/beta/frontend");
    const sections = groupRepos([acme, beta], ["/dev/acme/frontend"]);
    expect(sections[0].repos.map((r) => r.path)).toEqual(["/dev/acme/frontend"]);
    expect(sections[1].repos.map((r) => r.path)).toEqual(["/dev/beta/frontend"]);
  });

  it("still matches a legacy name pin when the basename is unique", () => {
    const sections = groupRepos(repos, ["b"]);
    expect(sections[0].repos.map((r) => r.name)).toEqual(["b"]);
  });

  it("does not apply a name pin to both checkouts when names clash", () => {
    const acme = repo("frontend", "main", "/dev/acme/frontend");
    const beta = repo("frontend", "main", "/dev/beta/frontend");
    const sections = groupRepos([acme, beta], ["frontend"]);
    expect(sections.map((s) => s.key)).toEqual(["__other__"]);
    expect(sections[0].repos.map((r) => r.path)).toEqual([
      "/dev/acme/frontend",
      "/dev/beta/frontend",
    ]);
  });
});

describe("repoPinKey and isRepoPinned", () => {
  const acme = repo("frontend", "main", "/dev/acme/frontend");
  const beta = repo("frontend", "main", "/dev/beta/frontend");
  const unique = repo("api", "main", "/dev/api");

  it("uses path as the pin key when names clash", () => {
    expect(repoPinKey(acme, [acme, beta])).toBe("/dev/acme/frontend");
    expect(repoPinKey(beta, [acme, beta])).toBe("/dev/beta/frontend");
  });

  it("uses basename when the name is unique", () => {
    expect(repoPinKey(unique, [acme, unique])).toBe("api");
  });

  it("treats a path pin as matching only that checkout", () => {
    expect(isRepoPinned(acme, ["/dev/acme/frontend"], [acme, beta])).toBe(true);
    expect(isRepoPinned(beta, ["/dev/acme/frontend"], [acme, beta])).toBe(false);
  });

  it("ignores a name pin when two checkouts share that basename", () => {
    expect(isRepoPinned(acme, ["frontend"], [acme, beta])).toBe(false);
    expect(isRepoPinned(beta, ["frontend"], [acme, beta])).toBe(false);
  });

  it("still matches a name pin when the basename is unique", () => {
    expect(isRepoPinned(unique, ["api"], [acme, unique])).toBe(true);
  });
});

describe("togglePinnedOrder", () => {
  const acme = repo("frontend", "main", "/dev/acme/frontend");
  const beta = repo("frontend", "main", "/dev/beta/frontend");
  const unique = repo("api", "main", "/dev/api");

  it("pins by path when names clash", () => {
    expect(togglePinnedOrder(acme, [acme, beta], [])).toEqual([
      "/dev/acme/frontend",
    ]);
  });

  it("unpins a path pin", () => {
    expect(
      togglePinnedOrder(acme, [acme, beta], ["/dev/acme/frontend"]),
    ).toEqual([]);
  });

  it("clears a leftover name pin when pinning a clashing checkout", () => {
    expect(togglePinnedOrder(acme, [acme, beta], ["frontend"])).toEqual([
      "/dev/acme/frontend",
    ]);
  });

  it("unpins by dropping both name and path keys", () => {
    expect(
      togglePinnedOrder(acme, [acme, beta], [
        "frontend",
        "/dev/acme/frontend",
      ]),
    ).toEqual([]);
  });

  it("pins and unpins by basename when the name is unique", () => {
    expect(togglePinnedOrder(unique, [acme, unique], [])).toEqual(["api"]);
    expect(togglePinnedOrder(unique, [acme, unique], ["api"])).toEqual([]);
  });
});

describe("sortRepos", () => {
  const acme = repo("acme", "main", "/dev/acme");
  const acmeFront = repo("frontend", "main", "/dev/acme/frontend");
  const betaFront = repo("frontend", "main", "/dev/beta/frontend");
  const beta = repo("beta", "main", "/dev/beta");
  const mixed = [betaFront, acmeFront, beta, acme];

  it("groups nested checkouts under their parent by path", () => {
    expect(sortRepos(mixed, true).map((r) => r.path)).toEqual([
      "/dev/acme",
      "/dev/acme/frontend",
      "/dev/beta",
      "/dev/beta/frontend",
    ]);
  });

  it("sorts by basename when grouping is off, with path as the tie-break", () => {
    expect(sortRepos(mixed, false).map((r) => r.path)).toEqual([
      "/dev/acme",
      "/dev/beta",
      "/dev/acme/frontend",
      "/dev/beta/frontend",
    ]);
  });

  it("keeps a prefix sibling from sorting between a parent and its child", () => {
    const tools = repo("acme-tools", "main", "/dev/acme-tools");
    expect(
      sortRepos([tools, acmeFront, acme], true).map((r) => r.path),
    ).toEqual(["/dev/acme", "/dev/acme/frontend", "/dev/acme-tools"]);
  });
});

describe("repoPathLabel at scale", () => {
  it("computes correct labels across many repos, including repeated calls on the same list", () => {
    // Regression test for the per-card lookups being cached by the `repos`
    // array reference: calling repoPathLabel/repoPinKey/isRepoPinned many
    // times against the *same* large array (as Dashboard does once per
    // rendered card) must keep returning results consistent with a
    // freshly-built equivalent array.
    const repos: RepoSummary[] = [];
    for (let i = 0; i < 50; i++) {
      repos.push(repo(`unique-${i}`, "main", `/dev/org${i}/unique-${i}`));
    }
    const acme = repo("frontend", "main", "/dev/acme/frontend");
    const beta = repo("frontend", "main", "/dev/beta/frontend");
    repos.push(acme, beta);

    for (const r of repos) {
      // called once per card, same array reference every time
      repoPathLabel(r, repos);
      repoPinKey(r, repos);
      isRepoPinned(r, [], repos);
    }

    expect(repoPathLabel(acme, repos)).toBe("acme/frontend");
    expect(repoPathLabel(beta, repos)).toBe("beta/frontend");
    expect(repoPathLabel(repos[0], repos)).toBeNull();
    expect(repoPinKey(acme, repos)).toBe("/dev/acme/frontend");
    expect(repoPinKey(repos[0], repos)).toBe("unique-0");
  });

  it("does not confuse two distinct repos arrays with identical content", () => {
    const acme = repo("frontend", "main", "/dev/acme/frontend");
    const beta = repo("frontend", "main", "/dev/beta/frontend");
    const listA = [acme, beta];
    const listB = [acme, beta];
    expect(repoPathLabel(acme, listA)).toBe("acme/frontend");
    expect(repoPathLabel(acme, listB)).toBe("acme/frontend");
  });
});

describe("prsForRepo", () => {
  const acme = {
    ...repo("frontend", "main", "/dev/acme/frontend"),
    origin_slug: "acme/frontend",
  };
  const beta = {
    ...repo("frontend", "main", "/dev/beta/frontend"),
    origin_slug: "beta/frontend",
  };
  const bucket = {
    "acme/frontend": [
      { number: 1, title: "a", url: "u", is_draft: false, repo: "frontend" },
    ],
    "beta/frontend": [
      { number: 2, title: "b", url: "u", is_draft: false, repo: "frontend" },
    ],
  };

  it("attaches PRs by origin slug so same-named checkouts stay distinct", () => {
    expect(prsForRepo(acme, bucket).map((p) => p.number)).toEqual([1]);
    expect(prsForRepo(beta, bucket).map((p) => p.number)).toEqual([2]);
  });

  it("falls back to basename when there is no origin slug", () => {
    const local = repo("beta");
    const byName = {
      beta: [{ number: 9, title: "x", url: "u", is_draft: false, repo: "beta" }],
    };
    expect(prsForRepo(local, byName).map((p) => p.number)).toEqual([9]);
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

  it("matches open-prs via origin slug so same-named checkouts stay distinct", () => {
    const acme = {
      ...repo("frontend", "main", "/dev/acme/frontend"),
      origin_slug: "acme/frontend",
    };
    const beta = {
      ...repo("frontend", "main", "/dev/beta/frontend"),
      origin_slug: "beta/frontend",
    };
    const prs: MyPrs = {
      authored: {
        "acme/frontend": [
          { number: 1, title: "x", url: "u", is_draft: false, repo: "frontend" },
        ],
      },
      review_requested: {},
      errors: {},
    };
    expect(
      filterByChips([acme, beta], new Set<RepoFilter>(["open-prs"]), prs, {}).map(
        (r) => r.path,
      ),
    ).toEqual(["/dev/acme/frontend"]);
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
