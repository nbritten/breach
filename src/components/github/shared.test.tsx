// @vitest-environment jsdom
import { act } from "react";
import { expect, it, vi } from "vitest";
import { render } from "../../test/render";
import { GitHubMarkdown, useGitHubResource } from "./shared";
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
it("ignores stale responses when navigating to another PR", async () => {
  let resolveFirst!: (value: string) => void;
  const first = () =>
    new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
  const second = async () => "Second PR";
  function View({ load }: { load: () => Promise<string> }) {
    const state = useGitHubResource(load);
    return <p>{state.data}</p>;
  }
  const view = await render(<View load={first} />);
  await view.rerender(<View load={second} />);
  await act(async () => {
    resolveFirst("First PR");
  });
  expect(view.container.textContent).toBe("Second PR");
  await view.unmount();
});
it("renders GitHub Markdown without executing raw HTML or unsafe links", async () => {
  const view = await render(
    <GitHubMarkdown
      url="https://github.com/acme/repo/pull/1"
      body={
        "## Review\n\n- [x] Tested\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert)\n\n![image](https://example.com/tracker.png)"
      }
    />,
  );
  expect(view.container.querySelector("h2")?.textContent).toBe("Review");
  expect(view.container.querySelector("script")).toBeNull();
  expect(view.container.querySelector("img")).toBeNull();
  expect(view.container.querySelector('a[href^="javascript:"]')).toBeNull();
  await view.unmount();
});
