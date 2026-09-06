import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { github, checkState, mergeBlock } from "../lib/github";
import { isDemoModeActive } from "../lib/api";
import { useToast } from "../lib/toast";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import {
  ExternalLink,
  GitHubError,
  GitHubLoading,
  useGitHubResource,
} from "../components/github/shared";
import { ActionDialog, type Composer } from "../components/github/ActionDialog";
import { Conversation } from "../components/github/Conversation";
import { Files } from "../components/github/Files";

export function GitHubPull() {
  const { owner, repo, number } = useParams();
  if (!owner || !repo || !number || !/^\d+$/.test(number) || Number(number) < 1)
    return (
      <div className="gh-empty">
        Invalid pull request. <Link to="/github">Return to GitHub</Link>
      </div>
    );
  return (
    <PullWorkspace
      key={`${owner}/${repo}#${number}`}
      repo={`${owner}/${repo}`}
      number={Number(number)}
    />
  );
}
function PullWorkspace({ repo, number }: { repo: string; number: number }) {
  const [tab, setTab] = useState<"conversation" | "files" | "checks">(
    "conversation",
  );
  const [visitedFiles, setVisitedFiles] = useState(false);
  const [composer, setComposer] = useState<Composer | null>(null);
  const load = useCallback(() => github.detail(repo, number), [repo, number]);
  const { data: detail, error, loading, refresh } = useGitHubResource(load);
  const { show } = useToast();
  const readonly = isDemoModeActive();
  if (loading) return <GitHubLoading />;
  if (error || !detail)
    return (
      <GitHubError
        error={error || "No pull request returned"}
        retry={refresh}
      />
    );
  const { pr } = detail;
  const block = mergeBlock(detail);
  const checks = detail.checks.statusCheckRollup || [];
  const methodsAvailable =
    detail.repository.allow_merge_commit ||
    detail.repository.allow_squash_merge ||
    detail.repository.allow_rebase_merge;
  return (
    <div className="flex flex-col h-full">
      <header className="page-header shrink-0">
        <Link to="/github" className="gh-link text-xs">
          GitHub / Pull requests
        </Link>
        <div className="flex items-start gap-4 mt-3">
          <div className="min-w-0 flex-1">
            <h1>
              {pr.title} <span className="text-neutral-500">#{number}</span>
            </h1>
            <p className="text-xs text-neutral-400 break-all">
              {repo} · {pr.user.login} · {pr.head.label} → {pr.base.label}
            </p>
          </div>
          <Button
            disabled={!!composer}
            onClick={refresh}
            aria-label="Refresh pull request"
            iconOnly
          >
            <Icon name="refresh" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-4 text-xs">
          <span
            className={`gh-state ${pr.merged ? "text-violet-300" : pr.state === "closed" ? "text-rose-300" : pr.draft ? "text-neutral-400" : "text-emerald-300"}`}
          >
            {pr.merged
              ? "Merged"
              : pr.draft
                ? "Draft"
                : pr.state === "open"
                  ? "Open"
                  : "Closed"}
          </span>
          <span className="text-emerald-300">+{pr.additions}</span>
          <span className="text-rose-300">−{pr.deletions}</span>
          <ExternalLink href={pr.html_url}>Open on GitHub ↗</ExternalLink>
          {readonly && (
            <span className="text-neutral-500">Demo · read-only</span>
          )}
        </div>
      </header>
      <div className="gh-review-toolbar">
        <div className="flex gap-2" aria-label="Pull request views">
          {(
            [
              ["conversation", "Conversation"],
              ["files", `Files changed · ${pr.changed_files}`],
              ["checks", `Checks · ${checks.length}`],
            ] as const
          ).map(([id, label]) => (
            <button
              className={`filter-chip ${tab === id ? "is-active" : ""}`}
              key={id}
              aria-pressed={tab === id}
              onClick={() => {
                setTab(id);
                if (id === "files") setVisitedFiles(true);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          variant="primary"
          disabled={readonly || pr.state !== "open"}
          onClick={() => setComposer({ kind: "review" })}
        >
          Review changes
        </Button>
      </div>
      <main className="gh-workspace overflow-auto flex-1">
        <div hidden={tab !== "conversation"}>
          <Conversation
            repo={repo}
            detail={detail}
            compose={setComposer}
            readonly={readonly}
          />
        </div>
        {visitedFiles && (
          <div hidden={tab !== "files"}>
            <Files
              repo={repo}
              detail={detail}
              compose={setComposer}
              readonly={readonly || pr.state !== "open"}
            />
          </div>
        )}
        {tab === "checks" && (
          <div className="gh-checks">
            <h2 className="text-sm font-medium mb-4">Checks and reviews</h2>
            <p className="text-xs text-neutral-400 mb-4">
              Review decision:{" "}
              {detail.checks.reviewDecision?.toLowerCase().replace(/_/g, " ") ||
                "No review decision yet"}
            </p>
            {!checks.length && (
              <p className="gh-empty">No checks reported by GitHub.</p>
            )}
            {checks.map((check, index) => (
              <div className="gh-check-row" key={index}>
                <span className={`gh-check-${checkState(check)}`}>
                  {checkState(check) === "passed"
                    ? "✓"
                    : checkState(check) === "failed"
                      ? "×"
                      : "•"}
                </span>
                <span className="flex-1">
                  {check.name || check.context || "Check"}
                </span>
                <span className="text-xs text-neutral-400">
                  {check.conclusion || check.state || check.status || "Pending"}
                </span>
                {(check.detailsUrl || check.targetUrl) && (
                  <ExternalLink href={check.detailsUrl || check.targetUrl!}>
                    Details ↗
                  </ExternalLink>
                )}
              </div>
            ))}
          </div>
        )}
        <section className="gh-merge-panel">
          <div>
            <h2 className="text-sm font-medium">
              {pr.merged ? "Merged" : "Merge pull request"}
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              {block ||
                (!methodsAvailable
                  ? "No merge method is available for this repository."
                  : "Choose a merge method and confirm when you’re ready. GitHub enforces the repository’s rules.")}
            </p>
          </div>
          <Button
            disabled={readonly || !!block || !methodsAvailable}
            onClick={() => setComposer({ kind: "merge" })}
          >
            Merge…
          </Button>
        </section>
      </main>
      {composer && (
        <ActionDialog
          repo={repo}
          detail={detail}
          composer={composer}
          close={() => setComposer(null)}
          complete={(message) => {
            setComposer(null);
            show(message, "info");
            refresh();
          }}
        />
      )}
    </div>
  );
}
