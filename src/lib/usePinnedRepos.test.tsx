// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { render } from "../test/render";
import { demoRepoSummaries } from "./demoFixtures";
import { usePinnedRepos } from "./usePinnedRepos";
const { getPins, setPins } = vi.hoisted(() => ({ getPins: vi.fn(), setPins: vi.fn() }));
vi.mock("./settings", () => ({ getEffectivePinnedRepos: getPins, setEffectivePinnedRepos: setPins }));
const repos = demoRepoSummaries().slice(0, 2);
let pins!: ReturnType<typeof usePinnedRepos>;
function Harness() { pins = usePinnedRepos(repos); return <span>{pins.pinnedOrder.join(",")}</span>; }
beforeEach(() => { getPins.mockReset().mockResolvedValue([]); setPins.mockReset().mockResolvedValue(undefined); });

it("serializes different cards so neither pin is lost", async () => {
  const view = await render(<Harness />);
  await act(async () => { await Promise.all([pins.togglePin(repos[0].name), pins.togglePin(repos[1].name)]); });
  expect(pins.pinnedOrder).toEqual([repos[0].name, repos[1].name]);
  expect(setPins.mock.calls.map(([value]) => value)).toEqual([[repos[0].name], [repos[0].name, repos[1].name]]);
  await view.unmount();
});

it("does not show unsaved pins and recovers after a failed write", async () => {
  setPins.mockRejectedValueOnce(new Error("Disk unavailable"));
  const view = await render(<Harness />);
  await act(async () => { await expect(pins.togglePin(repos[0].name)).rejects.toThrow("Disk unavailable"); });
  expect(pins.pinnedOrder).toEqual([]);
  await act(async () => pins.togglePin(repos[1].name));
  expect(pins.pinnedOrder).toEqual([repos[1].name]);
  await view.unmount();
});

it("does not let an older refresh overwrite a newly saved pin", async () => {
  let resolve!: (value: string[]) => void;
  getPins.mockImplementation(() => new Promise<string[]>((done) => { resolve = done; }));
  const view = await render(<Harness />);
  let refresh!: Promise<void>;
  await act(async () => { refresh = pins.refreshPins(); });
  await act(async () => pins.togglePin(repos[0].name));
  await act(async () => { resolve([]); await refresh; });
  expect(pins.pinnedOrder).toEqual([repos[0].name]);
  await view.unmount();
});
