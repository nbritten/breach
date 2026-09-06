// @vitest-environment jsdom
import { act } from "react";
import { expect, it, vi } from "vitest";
import { render } from "../test/render";
import { CiStatusIndicator } from "./CiStatusIndicator";
import { ciPresentation } from "../lib/ciPresentation";
import type { CiStatus } from "../types";
const { openUrl } = vi.hoisted(() => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));
const base: CiStatus = { state: "success", conclusion: "success", workflow: "Build", url: null };

it("shows status without an inert button when no details URL exists", async () => {
  const view = await render(<CiStatusIndicator ci={base} />);
  expect(view.container.textContent).toContain("Checks passing");
  expect(view.container.querySelector("button")).toBeNull();
  await view.unmount();
});

it("opens the exact check run with an explicitly named action", async () => {
  const view = await render(<CiStatusIndicator ci={{ ...base, url: "https://github.com/org/repo/actions/runs/123" }} />);
  const button = view.container.querySelector("button")!;
  expect(button.getAttribute("aria-label")).toBe("Checks passing. Open check details");
  await act(async () => button.click());
  expect(openUrl).toHaveBeenCalledWith("https://github.com/org/repo/actions/runs/123");
  await view.unmount();
});

it.each([
  ["success", "success", "Checks passing"],
  ["failure", "failure", "Checks failing"],
  ["failure", "timed_out", "Checks timed out"],
  ["in_progress", null, "Checks running"],
  ["other", "cancelled", "Checks cancelled"],
  ["other", "skipped", "Checks skipped"],
  ["other", null, "Checks unknown"],
] as const)("labels %s / %s without relying on color", (state, conclusion, label) => {
  expect(ciPresentation({ ...base, state, conclusion }).label).toBe(label);
});
