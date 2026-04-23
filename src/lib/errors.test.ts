import { describe, expect, it } from "vitest";
import { errorText } from "./errors";

describe("errorText", () => {
  it("handles null/undefined", () => {
    expect(errorText(null)).toBe("Unknown error");
    expect(errorText(undefined)).toBe("Unknown error");
  });

  it("extracts Error message", () => {
    expect(errorText(new Error("boom"))).toBe("boom");
  });

  it("passes strings through", () => {
    expect(errorText("plain message")).toBe("plain message");
  });

  it("serializes unknown objects", () => {
    expect(errorText({ code: 42 })).toBe('{"code":42}');
  });

  it("falls back to String() on non-serializable values", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(errorText(cyclic)).toBe("[object Object]");
  });
});
