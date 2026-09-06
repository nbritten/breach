// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { render } from "../test/render";
import { UpdateIndicator } from "./UpdateIndicator";
const { install, skip, notes } = vi.hoisted(() => ({ install: vi.fn(), skip: vi.fn(), notes: vi.fn() }));
vi.mock("../lib/settings", () => ({ getCheckForUpdates: async () => true }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: notes }));
vi.mock("../lib/updates", async (original) => ({
  ...await original<typeof import("../lib/updates")>(),
  checkForUpdate: async () => ({ version: "0.8.0" }),
  getSkippedVersion: async () => null,
  getLastCheckedAt: async () => Date.now(),
  installAndRelaunch: install,
  setSkippedVersion: skip,
}));
beforeEach(() => { install.mockReset(); skip.mockReset().mockResolvedValue(undefined); notes.mockReset().mockResolvedValue(undefined); });

it("opens labeled update details and restores focus on Escape", async () => {
  const view = await render(<UpdateIndicator />);
  const trigger = view.container.querySelector("button")!;
  expect(trigger.textContent).toContain("Update available");
  await act(async () => trigger.click());
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement?.getAttribute("role")).toBe("dialog");
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(view.container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await view.unmount();
});

it("surfaces install failure and blocks duplicate clicks during retry", async () => {
  install.mockRejectedValueOnce(new Error("Network unavailable")).mockImplementationOnce(() => new Promise(() => {}));
  const view = await render(<UpdateIndicator />);
  await act(async () => view.container.querySelector("button")!.click());
  const installButton = [...view.container.querySelectorAll("button")].find((button) => button.textContent?.includes("Install and restart"))!;
  await act(async () => installButton.click());
  expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("Network unavailable");
  expect(installButton.disabled).toBe(false);
  await act(async () => { installButton.click(); installButton.click(); });
  expect(install).toHaveBeenCalledTimes(2);
  expect(installButton.disabled).toBe(true);
  expect(view.container.querySelector('[role="status"]')?.textContent).toContain("Downloading");
  await view.unmount();
});

it("keeps the update visible if saving a skipped version fails", async () => {
  skip.mockRejectedValueOnce(new Error("Cannot save settings"));
  const view = await render(<UpdateIndicator />);
  await act(async () => view.container.querySelector("button")!.click());
  const skipButton = [...view.container.querySelectorAll("button")].find((button) => button.textContent === "Skip this version")!;
  await act(async () => skipButton.click());
  expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("Cannot save settings");
  expect(view.container.querySelector('[aria-haspopup="dialog"]')).not.toBeNull();
  await act(async () => skipButton.click());
  expect(skip).toHaveBeenLastCalledWith("0.8.0");
  expect(view.container.querySelector("button")).toBeNull();
  await view.unmount();
});
