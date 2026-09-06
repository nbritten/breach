// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { render } from "../../test/render";
import { ActionDialog } from "./ActionDialog";
import { github } from "../../lib/github";
import { demoGitHub } from "../../lib/githubDemo";
vi.mock("../../lib/github", async (original) => ({
  ...(await original<typeof import("../../lib/github")>()),
  github: { action: vi.fn() },
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
const detail = demoGitHub.detail("example/breach", 128);

it("requires confirmation and sends the inspected commit with the allowed merge method", async () => {
  const complete = vi.fn();
  const view = await render(
    <ActionDialog
      repo="example/breach"
      detail={{ ...detail, repository: { allow_rebase_merge: true } }}
      composer={{ kind: "merge" }}
      close={vi.fn()}
      complete={complete}
    />,
  );
  expect(github.action).not.toHaveBeenCalled();
  expect(view.container.querySelectorAll("option")).toHaveLength(1);
  const submit = [...view.container.querySelectorAll("button")].find(
    (button) => button.textContent === "Confirm merge",
  )!;
  await act(async () => {
    submit.click();
    submit.click();
  });
  expect(github.action).toHaveBeenCalledExactlyOnceWith("example/breach", 128, {
    kind: "merge",
    sha: detail.pr.head.sha,
    method: "rebase",
  });
  expect(complete).toHaveBeenCalledWith("Pull request merged");
  await view.unmount();
});

it("keeps draft text after a failed submission and after closing", async () => {
  vi.mocked(github.action).mockRejectedValue(new Error("Network unavailable"));
  const props = {
    repo: "example/drafts",
    detail,
    composer: { kind: "comment" as const },
    close: vi.fn(),
    complete: vi.fn(),
  };
  let view = await render(<ActionDialog {...props} />);
  const textarea = view.container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(textarea, "Please keep this draft");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    [...view.container.querySelectorAll("button")]
      .find((button) => button.textContent === "Post comment")!
      .click();
  });
  expect(view.container.querySelector('[role="alert"]')?.textContent).toContain(
    "Network unavailable",
  );
  expect(textarea.value).toBe("Please keep this draft");
  expect(props.complete).not.toHaveBeenCalled();
  await view.unmount();
  view = await render(<ActionDialog {...props} />);
  expect(view.container.querySelector("textarea")!.value).toBe(
    "Please keep this draft",
  );
  await view.unmount();
});

it("prevents self-approval and requires text for a comment review", async () => {
  const view = await render(
    <ActionDialog
      repo="example/self"
      detail={{ ...detail, viewer: detail.pr.user.login }}
      composer={{ kind: "review" }}
      close={vi.fn()}
      complete={vi.fn()}
    />,
  );
  const radios = view.container.querySelectorAll<HTMLInputElement>(
    'input[type="radio"]',
  );
  expect(radios[1].disabled).toBe(true);
  expect(radios[2].disabled).toBe(true);
  expect(
    [...view.container.querySelectorAll("button")].find(
      (button) => button.textContent === "Submit review",
    )!.disabled,
  ).toBe(true);
  await view.unmount();
});
