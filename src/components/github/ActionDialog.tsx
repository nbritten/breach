import { useRef, useState } from "react";
import { Modal } from "../Modal";
import { Button } from "../Button";
import {
  github,
  type MergeMethod,
  type PrAction,
  type PullDetail,
  type ReviewEvent,
} from "../../lib/github";
import { errorText } from "../../lib/errors";
import { GitHubMarkdown } from "./shared";

export type Composer =
  | { kind: "comment" }
  | { kind: "review" }
  | { kind: "merge" }
  | { kind: "inline"; path: string; line: number; side: "LEFT" | "RIGHT" }
  | { kind: "reply"; comment_id: number; path: string };
// Keep unfinished text when navigating between workspaces. Never reuse a draft
// across repositories, pull requests, or inline comment locations.
const drafts = new Map<string, string>();
export function ActionDialog({
  repo,
  detail,
  composer,
  close,
  complete,
}: {
  repo: string;
  detail: PullDetail;
  composer: Composer;
  close: () => void;
  complete: (message: string) => void;
}) {
  const { pr } = detail;
  const draftKey = `${repo}#${pr.number}:${JSON.stringify(composer)}`;
  const [body, setBody] = useState(() => drafts.get(draftKey) || "");
  const [event, setEvent] = useState<ReviewEvent>("COMMENT");
  const methods = (
    [
      ["squash", "Squash and merge", detail.repository.allow_squash_merge],
      ["merge", "Create a merge commit", detail.repository.allow_merge_commit],
      ["rebase", "Rebase and merge", detail.repository.allow_rebase_merge],
    ] as const
  ).filter((method) => method[2]);
  const [method, setMethod] = useState<MergeMethod>(
    methods[0]?.[0] || "squash",
  );
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const merge = composer.kind === "merge";
  const title = merge
    ? "Merge pull request"
    : composer.kind === "review"
      ? "Submit your review"
      : composer.kind === "inline"
        ? "Comment on this line"
        : composer.kind === "reply"
          ? "Reply to thread"
          : "Leave a comment";
  const valid = merge
    ? methods.length > 0
    : (composer.kind === "review" && event === "APPROVE") ||
      body.trim().length > 0;
  const submit = async () => {
    if (lock.current || !valid) return;
    lock.current = true;
    setBusy(true);
    setError("");
    let action: PrAction;
    if (composer.kind === "merge")
      action = { kind: "merge", sha: pr.head.sha, method };
    else if (composer.kind === "review")
      action = { kind: "review", body, event, sha: pr.head.sha };
    else if (composer.kind === "inline")
      action = { ...composer, body, sha: pr.head.sha };
    else if (composer.kind === "reply")
      action = { kind: "reply", body, comment_id: composer.comment_id };
    else action = { kind: "comment", body };
    try {
      await github.action(repo, pr.number, action);
      drafts.delete(draftKey);
      complete(
        merge
          ? "Pull request merged"
          : composer.kind === "review"
            ? "Review submitted"
            : "Comment posted",
      );
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      subtitle={
        <span className="text-xs text-neutral-400">
          {repo} #{pr.number} · {pr.title}
        </span>
      }
      onClose={close}
      closable={!busy}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid || busy} onClick={submit}>
            {busy
              ? "Submitting…"
              : merge
                ? "Confirm merge"
                : composer.kind === "review"
                  ? "Submit review"
                  : "Post comment"}
          </Button>
        </div>
      }
    >
      {merge ? (
        <div className="space-y-4">
          <p className="text-sm">
            Merge <strong>{pr.head.label}</strong> into{" "}
            <strong>{pr.base.label}</strong>.
          </p>
          <label className="block text-xs text-neutral-400">
            Merge method
            <select
              className="gh-input block w-full mt-2"
              value={method}
              onChange={(e) => setMethod(e.target.value as MergeMethod)}
              disabled={busy}
            >
              {methods.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-neutral-400">
            GitHub will check permissions, branch rules, and that no new commits
            have been pushed. Branches are kept after merging.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {composer.kind === "review" && (
            <fieldset className="flex flex-col gap-2 text-sm" disabled={busy}>
              <legend className="sr-only">Review outcome</legend>
              {(
                [
                  ["COMMENT", "Comment"],
                  ["APPROVE", "Approve"],
                  ["REQUEST_CHANGES", "Request changes"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="review-event"
                    checked={event === value}
                    disabled={
                      value !== "COMMENT" && pr.user.login === detail.viewer
                    }
                    onChange={() => setEvent(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          {composer.kind === "inline" && (
            <p className="text-xs text-neutral-400 break-all">
              {composer.path} · line {composer.line} (
              {composer.side === "LEFT" ? "original" : "updated"})
            </p>
          )}
          {composer.kind === "reply" && (
            <p className="text-xs text-neutral-400 break-all">
              {composer.path}
            </p>
          )}
          <div className="flex items-center justify-between">
            <label
              htmlFor="github-comment"
              className="text-xs text-neutral-400"
            >
              {composer.kind === "review" && event === "APPROVE"
                ? "Comment (optional)"
                : "Comment"}
            </label>
            <Button variant="ghost" onClick={() => setPreview(!preview)}>
              {preview ? "Write" : "Preview"}
            </Button>
          </div>
          {preview ? (
            <div className="gh-input min-h-40">
              <GitHubMarkdown
                body={body || "Nothing to preview yet."}
                url={pr.html_url}
              />
            </div>
          ) : (
            <textarea
              id="github-comment"
              autoFocus
              className="gh-input w-full min-h-40 resize-y"
              placeholder="Share your thoughts. Markdown is supported."
              value={body}
              disabled={busy}
              maxLength={65000}
              onChange={(e) => {
                setBody(e.target.value);
                drafts.set(draftKey, e.target.value);
              }}
            />
          )}
          {composer.kind === "review" && (
            <p className="text-xs text-neutral-500">
              Reviewing commit {pr.head.sha.slice(0, 7)}
            </p>
          )}
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="text-sm text-rose-300 whitespace-pre-wrap mt-4"
        >
          {error}
        </p>
      )}
    </Modal>
  );
}
