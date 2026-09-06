// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./settings", () => ({ getTheme: vi.fn(), setTheme: vi.fn() }));
import { getTheme, setTheme } from "./settings";

beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); });

describe("theme persistence", () => {
  it("loads the saved theme before rendering", async () => {
    vi.mocked(getTheme).mockResolvedValue("plum");
    const state = await import("./themeState");
    await state.loadTheme();
    expect(document.documentElement.dataset.theme).toBe("plum");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#e4b4ed");
  });

  it("falls back when the store cannot load", async () => {
    vi.mocked(getTheme).mockRejectedValue(new Error("unavailable"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    await (await import("./themeState")).loadTheme();
    expect(document.documentElement.dataset.theme).toBe("graphite");
    warning.mockRestore();
  });

  it("previews immediately, serializes saves, and restores the last saved choice on failure", async () => {
    let finish!: () => void;
    vi.mocked(setTheme)
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }))
      .mockRejectedValueOnce(new Error("disk full"));
    const state = await import("./themeState");
    const first = state.selectTheme("ocean");
    await Promise.resolve();
    const second = state.selectTheme("rose");
    const rejected = expect(second).rejects.toThrow("disk full");
    expect(document.documentElement.dataset.theme).toBe("rose");
    expect(setTheme).toHaveBeenCalledTimes(1);
    finish();
    await first;
    await rejected;
    expect(document.documentElement.dataset.theme).toBe("ocean");
    await state.selectTheme("iris");
    expect(document.documentElement.dataset.theme).toBe("iris");
  });
});
