import { describe, expect, it } from "vitest";
import type { Update } from "@tauri-apps/plugin-updater";
import { shouldNotifyAboutUpdate } from "./updates";

const mkUpdate = (version: string): Update => ({ version }) as Update;

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
