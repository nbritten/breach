// @vitest-environment jsdom
import { act } from "react";
import { expect, it, vi } from "vitest";
import { render } from "../test/render";
import { RepositoryFilters } from "./RepositoryFilters";
import { REPO_FILTER_ORDER, type RepoFilter } from "../lib/dashboard";
const counts = Object.fromEntries(REPO_FILTER_ORDER.map((filter) => [filter, 0])) as Record<RepoFilter, number>;

it("keeps zero-count filters stable and lets an active empty filter be removed", async () => {
  const onToggle = vi.fn();
  const onClear = vi.fn();
  const view = await render(<RepositoryFilters counts={counts} active={new Set(["dirty"])} onToggle={onToggle} onClear={onClear} visible={0} total={4} />);
  const selected = view.container.querySelector<HTMLButtonElement>('[aria-pressed="true"]')!;
  expect(selected.disabled).toBe(false);
  expect(view.container.querySelectorAll('[aria-pressed]')).toHaveLength(REPO_FILTER_ORDER.length);
  expect([...view.container.querySelectorAll<HTMLButtonElement>('[aria-pressed="false"]')].every((button) => button.disabled)).toBe(true);
  await act(async () => selected.click());
  expect(onToggle).toHaveBeenCalledWith("dirty");
  await act(async () => view.container.querySelector<HTMLButtonElement>(".filter-clear")!.click());
  expect(onClear).toHaveBeenCalledOnce();
  expect(view.container.querySelector('[role="status"]')?.textContent).toBe("0 of 4 repositories");
  await view.unmount();
});

it("explains the existing union behavior for multiple selected filters", async () => {
  const view = await render(<RepositoryFilters counts={counts} active={new Set(["dirty", "behind"])} onToggle={vi.fn()} onClear={vi.fn()} visible={2} total={3} searching />);
  expect(view.container.textContent).toContain("Matching any selected filter");
  expect(view.container.textContent).toContain("2 of 3 search results");
  await view.unmount();
});
