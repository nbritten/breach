// @vitest-environment jsdom
import { act, useState } from "react";
import { expect, it, vi } from "vitest";
import { render } from "../test/render";
import { TerminalTabs } from "./TerminalTabs";
import type { TerminalWorkspaceSession } from "../lib/terminalSession";

const sessions: TerminalWorkspaceSession[] = [
  { id: "one", title: "Breach", cwd: "/repos/breach", pid: 1, status: "running" },
  { id: "two", title: "API", cwd: "/repos/api", pid: null, status: "exited" },
];

it("supports roving keyboard selection, wraparound, and named close actions", async () => {
  const onClose = vi.fn();
  function Harness() {
    const [activeId, onActivate] = useState("one");
    return <TerminalTabs sessions={sessions} activeId={activeId} onActivate={onActivate} onClose={onClose} onCreate={vi.fn()} onRename={vi.fn()} />;
  }
  const view = await render(<Harness />);
  const tabs = view.container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  await act(async () => tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
  expect(tabs[1].getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(tabs[1]);
  expect(tabs[0].tabIndex).toBe(-1);
  await act(async () => tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true })));
  expect(onClose).toHaveBeenCalledWith("two");
  expect(view.container.querySelector('[aria-label="Close API"]')).not.toBeNull();
  await view.unmount();
});

it("lets F2 start rename and Escape cancel without saving or losing tab focus", async () => {
  const onRename = vi.fn();
  const view = await render(<TerminalTabs sessions={sessions} activeId="one" onActivate={vi.fn()} onClose={vi.fn()} onCreate={vi.fn()} onRename={onRename} />);
  await act(async () => view.container.querySelector('[role="tab"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true })));
  const input = view.container.querySelector("input")!;
  expect(document.activeElement).toBe(input);
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(onRename).not.toHaveBeenCalled();
  expect(view.container.querySelector("input")).toBeNull();
  expect(document.activeElement?.getAttribute("role")).toBe("tab");
  await view.unmount();
});
