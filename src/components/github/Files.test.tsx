// @vitest-environment jsdom
import { act } from "react";
import { expect, it, vi } from "vitest";
import { render } from "../../test/render";
import { Files } from "./Files";
import { github } from "../../lib/github";
import { demoGitHub } from "../../lib/githubDemo";
vi.mock("../../lib/github", async (original) => ({
  ...(await original<typeof import("../../lib/github")>()),
  github: { files: vi.fn() },
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
it("anchors deletion and addition comments to the displayed file and side", async () => {
  vi.mocked(github.files).mockResolvedValue(demoGitHub.files());
  const compose = vi.fn();
  const detail = demoGitHub.detail("example/breach", 128);
  const view = await render(
    <Files
      repo="example/breach"
      detail={detail}
      compose={compose}
      readonly={false}
    />,
  );
  expect(github.files).toHaveBeenCalledWith(
    "example/breach",
    128,
    detail.pr.head.sha,
  );
  await act(async () => {
    view.container
      .querySelector<HTMLButtonElement>(
        '[aria-label="Comment on original line 2"]',
      )!
      .click();
  });
  expect(compose).toHaveBeenLastCalledWith({
    kind: "inline",
    path: "src/workspace.ts",
    line: 2,
    side: "LEFT",
  });
  await act(async () => {
    view.container
      .querySelector<HTMLButtonElement>(
        '[aria-label="Comment on updated line 3"]',
      )!
      .click();
  });
  expect(compose).toHaveBeenLastCalledWith({
    kind: "inline",
    path: "src/workspace.ts",
    line: 3,
    side: "RIGHT",
  });
  await view.unmount();
});
