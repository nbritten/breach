import { useCallback } from "react";
import { github, type PullDetail } from "../../lib/github";
import { Button } from "../Button";
import {
  dateLabel,
  GitHubError,
  GitHubLoading,
  GitHubMarkdown,
  useGitHubResource,
} from "./shared";
import type { Composer } from "./ActionDialog";

export function Conversation({
  repo,
  detail,
  compose,
  readonly,
}: {
  repo: string;
  detail: PullDetail;
  compose: (composer: Composer) => void;
  readonly: boolean;
}) {
  const load = useCallback(
    () => github.conversation(repo, detail.pr.number),
    [repo, detail.pr.number],
  );
  const { data, loading, error, refresh } = useGitHubResource(load);
  const entries = data
    ? [
        ...data.comments.map((entry) => ({ ...entry, kind: "comment" })),
        ...data.reviews
          .filter((entry) => entry.state !== "PENDING")
          .map((entry) => ({ ...entry, kind: "review" })),
        ...data.inline.map((entry) => ({ ...entry, kind: "inline" })),
      ].sort((a, b) =>
        (a.created_at || a.submitted_at || "").localeCompare(
          b.created_at || b.submitted_at || "",
        ),
      )
    : [];
  return (
    <div className="gh-conversation">
      <article className="gh-discussion">
        <header>
          <strong>{detail.pr.user.login}</strong>
          <span>opened this pull request</span>
        </header>
        <GitHubMarkdown
          body={detail.pr.body || "No description provided."}
          url={detail.pr.html_url}
        />
      </article>
      {loading ? (
        <GitHubLoading />
      ) : error ? (
        <GitHubError error={error} retry={refresh} />
      ) : (
        entries.map((entry) => (
          <article className="gh-discussion" key={`${entry.kind}:${entry.id}`}>
            <header>
              <strong>{entry.user?.login || "Deleted user"}</strong>
              <span>
                {entry.kind === "review"
                  ? (entry.state || "reviewed").toLowerCase().replace(/_/g, " ")
                  : entry.in_reply_to_id
                    ? "replied"
                    : "commented"}
              </span>
              <time>{dateLabel(entry.created_at || entry.submitted_at)}</time>
            </header>
            {entry.path && (
              <div className="mb-3">
                <p className="text-xs text-neutral-400 break-all mb-2">
                  {entry.path} ·{" "}
                  {entry.line ? `line ${entry.line}` : "outdated diff"}
                  {entry.in_reply_to_id
                    ? ` · reply to comment ${entry.in_reply_to_id}`
                    : ""}
                </p>
                {entry.diff_hunk && (
                  <pre className="gh-thread-diff">{entry.diff_hunk}</pre>
                )}
              </div>
            )}
            <GitHubMarkdown body={entry.body} url={detail.pr.html_url} />
            {entry.kind === "inline" && (
              <Button
                className="mt-3"
                variant="ghost"
                disabled={readonly}
                onClick={() =>
                  compose({
                    kind: "reply",
                    comment_id: entry.in_reply_to_id || entry.id,
                    path: entry.path || "",
                  })
                }
              >
                Reply to thread
              </Button>
            )}
          </article>
        ))
      )}
      <Button disabled={readonly} onClick={() => compose({ kind: "comment" })}>
        Leave a comment
      </Button>
    </div>
  );
}
