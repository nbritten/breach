import { describe, expect, it } from "vitest";
import { branchForRepo, buildServiceUrl, FALLBACK_DEFAULT_BRANCH } from "./settings";

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
