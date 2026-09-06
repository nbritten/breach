// @vitest-environment jsdom
import { act } from "react";
import { expect, it, vi } from "vitest";
import { render } from "../test/render";
import { TerminalLaunchButton } from "./TerminalLaunchButton";
const { openTerminal } = vi.hoisted(() => ({ openTerminal: vi.fn().mockResolvedValue("Terminal") }));
vi.mock("../lib/settings", () => ({ openTerminal }));

it("routes embedded and external launches to the requested folder", async () => {
  const onOpen = vi.fn().mockResolvedValue(undefined);
  const view = await render(<><TerminalLaunchButton path="/repos/breach" onOpen={onOpen} /><TerminalLaunchButton path="/repos/breach" external /></>);
  const buttons = view.container.querySelectorAll("button");
  await act(async () => buttons[0].click());
  expect(onOpen).toHaveBeenCalledWith("/repos/breach");
  expect(openTerminal).not.toHaveBeenCalled();
  await act(async () => buttons[1].click());
  expect(openTerminal).toHaveBeenCalledWith("/repos/breach");
  await view.unmount();
});

it("disables unavailable launch destinations instead of providing a no-op", async () => {
  const view = await render(<><TerminalLaunchButton path="/repos/breach" /><TerminalLaunchButton path="" external /></>);
  expect([...view.container.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
  await view.unmount();
});
