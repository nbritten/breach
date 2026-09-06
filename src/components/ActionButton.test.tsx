// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "../test/render";
import { ActionButton } from "./ActionButton";

const { showError } = vi.hoisted(() => ({ showError: vi.fn() }));
vi.mock("../lib/toast", () => ({ useToast: () => ({ showError }) }));

describe("action feedback", () => {
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it("runs once for rapid clicks, shows completion, and clears its timer on unmount", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const action = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const view = await render(<ActionButton action={action} label="Refresh" pendingLabel="Refreshing…" successLabel="Up to date" icon="refresh" />);
    const button = view.container.querySelector("button")!;
    await act(async () => { button.click(); button.click(); });
    expect(action).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    await act(async () => finish());
    expect(button.disabled).toBe(false);
    expect(view.container.querySelector('[role="status"]')?.textContent).toBe("Up to date");
    await view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a failure and allows retry without claiming success", async () => {
    const failure = new Error("Offline");
    const action = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);
    const view = await render(<ActionButton action={action} label="Refresh" pendingLabel="Refreshing…" successLabel="Up to date" icon="refresh" />);
    const button = view.container.querySelector("button")!;
    await act(async () => button.click());
    expect(showError).toHaveBeenCalledWith(failure);
    expect(button.dataset.state).toBe("error");
    await act(async () => button.click());
    expect(button.dataset.state).toBe("success");
    await view.unmount();
  });

  it("treats a handled failure as failure without a duplicate notification", async () => {
    const view = await render(<ActionButton action={async () => false} label="Refresh" pendingLabel="Refreshing…" successLabel="Up to date" icon="refresh" />);
    await act(async () => view.container.querySelector("button")!.click());
    expect(view.container.querySelector("button")!.dataset.state).toBe("error");
    expect(showError).not.toHaveBeenCalled();
    await view.unmount();
  });
});
