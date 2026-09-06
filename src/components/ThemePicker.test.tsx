// @vitest-environment jsdom
import { act } from "react";
import { expect, it, vi } from "vitest";
import { render } from "../test/render";
vi.mock("../lib/settings", () => ({ getTheme: vi.fn(), setTheme: vi.fn() }));
import { setTheme } from "../lib/settings";
import { ThemePicker } from "./ThemePicker";

it("offers a labeled radio group and reports save failures with the restored selection", async () => {
  vi.mocked(setTheme).mockRejectedValueOnce(new Error("disk full"));
  const view = await render(<ThemePicker />);
  const radios = view.container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
  expect(radios).toHaveLength(8);
  expect(view.container.querySelector("legend")?.textContent).toBe("Workspace theme");
  expect(radios[0].checked).toBe(true);
  await act(async () => { radios[1].click(); });
  expect(radios[0].checked).toBe(true);
  expect(view.container.querySelector('[role="status"]')?.textContent).toContain("Could not save");
  await act(async () => { radios[2].click(); });
  expect(radios[2].checked).toBe(true);
  expect(view.container.querySelector('[role="status"]')?.textContent).toBe("Ocean saved");
  await view.unmount();
});
