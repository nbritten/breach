import { describe, expect, it } from "vitest";
import {
  branchForRepo,
  buildServiceUrl,
  FALLBACK_DEFAULT_BRANCH,
  normalizeTerminalWorkspace,
} from "./settings";

describe("branchForRepo", () => {
  it("returns override when present", () => {
    expect(branchForRepo("abba", { abba: "beta" }, "main")).toBe("beta");
  });

  it("falls back to default when no override", () => {
    expect(branchForRepo("foo", { abba: "beta" }, "main")).toBe("main");
  });

  it("uses FALLBACK when no default passed", () => {
    expect(branchForRepo("foo", {}, FALLBACK_DEFAULT_BRANCH)).toBe("main");
  });

  it("prefers a path override over a basename override", () => {
    expect(
      branchForRepo(
        "frontend",
        { frontend: "develop", "/dev/acme/frontend": "release" },
        "main",
        "/dev/acme/frontend",
      ),
    ).toBe("release");
  });

  it("falls back to a basename override when no path key exists", () => {
    expect(
      branchForRepo("frontend", { frontend: "develop" }, "main", "/dev/acme/frontend"),
    ).toBe("develop");
  });
});

describe("buildServiceUrl", () => {
  it("substitutes {name}", () => {
    expect(buildServiceUrl("https://{name}.example.com/docs", "foo")).toBe(
      "https://foo.example.com/docs",
    );
  });

  it("substitutes multiple {name} occurrences", () => {
    expect(buildServiceUrl("https://{name}.api/{name}/docs", "svc")).toBe(
      "https://svc.api/svc/docs",
    );
  });

  it("returns template as-is when no placeholder", () => {
    expect(buildServiceUrl("https://example.com/docs", "foo")).toBe(
      "https://example.com/docs",
    );
  });

  it("returns null for blank template", () => {
    expect(buildServiceUrl("", "foo")).toBeNull();
    expect(buildServiceUrl("   ", "foo")).toBeNull();
  });

  it("returns null for empty repo name", () => {
    expect(buildServiceUrl("https://{name}.example.com", "")).toBeNull();
  });
});

describe("normalizeTerminalWorkspace", () => {
  it("keeps valid sessions and clamps the active index", () => {
    expect(
      normalizeTerminalWorkspace({
        sessions: [
          { cwd: "/repos/breach", title: "Breach" },
          { cwd: "/repos/site", title: "Site" },
        ],
        activeIndex: 20,
      }),
    ).toEqual({
      sessions: [
        { cwd: "/repos/breach", title: "Breach" },
        { cwd: "/repos/site", title: "Site" },
      ],
      activeIndex: 1,
    });
  });

  it("drops invalid entries and derives missing titles", () => {
    expect(
      normalizeTerminalWorkspace({
        sessions: [
          { cwd: "/repos/breach", title: "" },
          { cwd: "", title: "invalid" },
          null,
        ],
        activeIndex: -2,
      }),
    ).toEqual({
      sessions: [{ cwd: "/repos/breach", title: "breach" }],
      activeIndex: 0,
    });
  });

  it("falls back to an empty workspace for malformed state", () => {
    expect(normalizeTerminalWorkspace("broken")).toEqual({
      sessions: [],
      activeIndex: 0,
    });
  });
});
