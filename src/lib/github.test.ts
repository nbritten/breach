import { describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./api", () => ({ isDemoModeActive: vi.fn(() => false) }));
import { invoke } from "@tauri-apps/api/core";
import { isDemoModeActive } from "./api";
import {
  github,
  checkState,
  mergeBlock,
  parsePullUrl,
  repositoryOf,
} from "./github";
import { demoGitHub } from "./githubDemo";

describe("GitHub workspace", () => {
  it("opens GitHub pull request URLs inside the workspace", () => {
    expect(
      parsePullUrl("https://github.com/acme/project/pull/42/files#diff-123"),
    ).toBe("/github/acme/project/pull/42");
    for (const value of [
      "javascript:alert(1)",
      "https://github.com.evil.test/a/b/pull/1",
      "https://github.com/a/b/issues/1",
      "https://github.com/a/b/pull/0",
      "repo:acme/project",
    ])
      expect(parsePullUrl(value)).toBeNull();
    expect(repositoryOf(demoGitHub.search("review", "", 1).items[0])).toBe(
      "example/breach",
    );
  });
  it("treats incomplete checks as pending, not successful", () => {
    expect(checkState({ status: "COMPLETED", conclusion: "SUCCESS" })).toBe(
      "passed",
    );
    expect(checkState({ state: "FAILURE" })).toBe("failed");
    expect(checkState({ conclusion: "CANCELLED" })).toBe("failed");
    expect(checkState({ conclusion: "SKIPPED" })).toBe("neutral");
    expect(checkState({ status: "IN_PROGRESS" })).toBe("pending");
    expect(checkState({})).toBe("pending");
  });
  it("blocks merge for drafts, conflicts, rules, and missing permissions", () => {
    const detail = demoGitHub.detail("example/breach", 128);
    expect(mergeBlock(detail)).toBeNull();
    for (const patch of [
      { draft: true },
      { merged: true },
      { state: "closed" },
      { mergeable: null },
      { mergeable: false },
      { mergeable_state: "blocked" },
      { mergeable_state: "behind" },
    ]) {
      expect(
        mergeBlock({ ...detail, pr: { ...detail.pr, ...patch } }),
      ).not.toBeNull();
    }
    expect(mergeBlock({ ...detail, repository: {} })).toMatch(/permission/);
  });
  it("never reads or writes a real account in demo mode", async () => {
    vi.mocked(isDemoModeActive).mockReturnValue(true);
    vi.mocked(invoke).mockClear();
    await github.search("review", "", 1);
    await github.detail("example/breach", 128);
    await github.files("example/breach", 128, "a".repeat(40));
    await github.conversation("example/breach", 128);
    await expect(
      github.action("example/breach", 128, {
        kind: "merge",
        method: "merge",
        sha: "a".repeat(40),
      }),
    ).rejects.toThrow(/read-only/);
    expect(invoke).not.toHaveBeenCalled();
    vi.mocked(isDemoModeActive).mockReturnValue(false);
  });
});
