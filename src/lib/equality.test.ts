import { describe, expect, it } from "vitest";
import { jsonEqual } from "./equality";

describe("jsonEqual", () => {
  it("compares primitives with Object.is semantics", () => {
    expect(jsonEqual(1, 1)).toBe(true);
    expect(jsonEqual("a", "a")).toBe(true);
    expect(jsonEqual(null, null)).toBe(true);
    expect(jsonEqual(1, 2)).toBe(false);
    expect(jsonEqual(1, "1")).toBe(false);
    expect(jsonEqual(0, -0)).toBe(false);
    expect(jsonEqual(NaN, NaN)).toBe(true);
  });

  it("distinguishes null and undefined from objects", () => {
    expect(jsonEqual(null, {})).toBe(false);
    expect(jsonEqual({}, null)).toBe(false);
    expect(jsonEqual(undefined, null)).toBe(false);
  });

  it("compares arrays element-wise", () => {
    expect(jsonEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(jsonEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(jsonEqual([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(jsonEqual([], [])).toBe(true);
  });

  it("does not confuse arrays with objects", () => {
    expect(jsonEqual([], {})).toBe(false);
    expect(jsonEqual({ 0: "a", length: 1 }, ["a"])).toBe(false);
  });

  it("compares plain objects by keys and values", () => {
    expect(jsonEqual({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(true);
    expect(jsonEqual({ a: 1, b: "x" }, { b: "x", a: 1 })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(jsonEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    expect(jsonEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("recurses into nested structures", () => {
    const ci = {
      "/repos/alpha": {
        state: "success",
        conclusion: "success",
        workflow: "CI",
        url: "https://example.com/1",
      },
    };
    const same = JSON.parse(JSON.stringify(ci));
    expect(jsonEqual(ci, same)).toBe(true);
    same["/repos/alpha"].state = "failure";
    expect(jsonEqual(ci, same)).toBe(false);
  });

  it("handles arrays of objects (agent session payloads)", () => {
    const a = [{ provider: "claude", repo_path: "/repos/alpha" }];
    const b = [{ provider: "claude", repo_path: "/repos/alpha" }];
    expect(jsonEqual(a, b)).toBe(true);
    expect(jsonEqual(a, [{ provider: "codex", repo_path: "/repos/alpha" }])).toBe(
      false,
    );
    expect(jsonEqual(a, [])).toBe(false);
  });

  it("treats a missing key and an undefined value as different", () => {
    expect(jsonEqual({ a: undefined }, {})).toBe(false);
  });
});
