import { describe, expect, it } from "vitest";
import type { Update } from "@tauri-apps/plugin-updater";
import { shouldNotifyAboutUpdate, shouldRecheck } from "./updates";

const mkUpdate = (version: string): Update => ({ version }) as Update;

const HOUR = 60 * 60 * 1000;

describe("shouldNotifyAboutUpdate", () => {
  it("returns false when no update is available", () => {
    expect(shouldNotifyAboutUpdate(null, null)).toBe(false);
    expect(shouldNotifyAboutUpdate(null, "0.5.0")).toBe(false);
  });

  it("returns true when an update is available and nothing is skipped", () => {
    expect(shouldNotifyAboutUpdate(mkUpdate("0.6.0"), null)).toBe(true);
  });

  it("returns false when the available version is the one the user skipped", () => {
    expect(shouldNotifyAboutUpdate(mkUpdate("0.6.0"), "0.6.0")).toBe(false);
  });

  it("returns true when a different version was skipped previously", () => {
    expect(shouldNotifyAboutUpdate(mkUpdate("0.7.0"), "0.6.0")).toBe(true);
  });
});

describe("shouldRecheck", () => {
  it("returns true when there has been no previous check", () => {
    expect(shouldRecheck(null, 100, 4 * HOUR)).toBe(true);
  });

  it("returns false within the throttle window", () => {
    const now = 10 * HOUR;
    expect(shouldRecheck(now - 1 * HOUR, now, 4 * HOUR)).toBe(false);
    expect(shouldRecheck(now - (4 * HOUR - 1), now, 4 * HOUR)).toBe(false);
  });

  it("returns true at exactly the throttle boundary and beyond", () => {
    const now = 10 * HOUR;
    expect(shouldRecheck(now - 4 * HOUR, now, 4 * HOUR)).toBe(true);
    expect(shouldRecheck(now - 8 * HOUR, now, 4 * HOUR)).toBe(true);
  });
});
