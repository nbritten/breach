import { useCallback, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import {
  github,
  parsePullUrl,
  pullRoute,
  repositoryOf,
  type Inbox,
} from "../lib/github";
import { isDemoModeActive } from "../lib/api";
import {
  dateLabel,
  GitHubError,
  GitHubLoading,
  PullIcon,
  useGitHubResource,
} from "../components/github/shared";

const inboxes: { id: Inbox; label: string; description: string }[] = [
  {
    id: "review",
    label: "Needs your review",
    description: "Pull requests waiting for your perspective.",
  },
  {
    id: "authored",
    label: "Created by you",
    description: "Keep your work moving toward merge.",
  },
  {
    id: "involved",
    label: "Following",
    description:
      "Open pull requests you’ve authored, commented on, or been mentioned in, plus your assignments.",
  },
  {
    id: "search",
    label: "All pull requests",
    description: "Find work across the repositories you can access.",
  },
];
export function GitHub() {
  const [params, setParams] = useSearchParams();
  const queue =
    inboxes.find((inbox) => inbox.id === params.get("inbox")) || inboxes[0];
  const query = params.get("q") || "";
  const page = Math.max(1, Math.min(20, Number(params.get("page")) || 1));
  return (
    <InboxView
      key={`${queue.id}:${query}:${page}`}
      queue={queue}
      query={query}
      page={page}
      change={(inbox, q, next = 1) =>
        setParams({ inbox, q, page: String(next) })
      }
    />
  );
}
function InboxView({
  queue,
  query,
  page,
  change,
}: {
  queue: (typeof inboxes)[number];
  query: string;
  page: number;
  change: (inbox: Inbox, q: string, page?: number) => void;
}) {
  const navigate = useNavigate();
  const [input, setInput] = useState(query);
  const load = useCallback(
    () => github.search(queue.id, query, page),
    [queue.id, query, page],
  );
  const { data, loading, error, refresh } = useGitHubResource(load);
  return (
    <div className="flex flex-col h-full">
      <header className="page-header flex items-center shrink-0">
        <div>
          <h1>GitHub</h1>
          <p className="text-xs text-neutral-400">
            Your team’s work, close at hand.
          </p>
        </div>
        <div className="page-actions flex items-center gap-3">
          {data && (
            <span className="text-xs text-neutral-400">
              {isDemoModeActive()
                ? "Demo · read-only"
                : `Signed in as ${data.login}`}
            </span>
          )}
          <Button onClick={refresh} disabled={loading}>
            <Icon name="refresh" />
            Refresh
          </Button>
        </div>
      </header>
      <main className="gh-workspace overflow-auto flex-1">
        <div
          className="flex flex-wrap gap-2 mb-5"
          aria-label="Pull request inboxes"
        >
          {inboxes.map((inbox) => (
            <button
              key={inbox.id}
              className={`filter-chip ${queue.id === inbox.id ? "is-active" : ""}`}
              aria-pressed={queue.id === inbox.id}
              onClick={() => change(inbox.id, query)}
            >
              {inbox.label}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2 mb-2"
          onSubmit={(event) => {
            event.preventDefault();
            const route = parsePullUrl(input);
            if (route) navigate(route);
            else change(queue.id, input.trim());
          }}
        >
          <input
            aria-label="Search pull requests"
            className="search-field flex-1 min-w-0 px-3 py-2 text-sm"
            placeholder="Search pull requests or paste a GitHub PR link…"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <Button type="submit">Search</Button>
        </form>
        <p className="text-xs text-neutral-500 mb-6">
          Use GitHub filters like <code>repo:owner/repo</code>,{" "}
          <code>label:bug</code>, or <code>is:merged</code> in All pull
          requests.
        </p>
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <div>
            <h2 className="text-sm font-medium">{queue.label}</h2>
            <p className="text-xs text-neutral-400 mt-1">{queue.description}</p>
          </div>
          {data && (
            <span className="text-xs text-neutral-400">
              {data.total_count.toLocaleString()} pull requests
            </span>
          )}
        </div>
        {loading ? (
          <GitHubLoading />
        ) : error ? (
          <GitHubError error={error} retry={refresh} />
        ) : (
          data && (
            <>
              {data.incomplete_results && (
                <p role="status" className="text-amber-300 text-xs mb-3">
                  GitHub returned partial results. Refine your search or
                  refresh.
                </p>
              )}
              {!data.items.length ? (
                <div className="gh-empty">
                  <PullIcon />
                  <h2>
                    {query
                      ? "No matching pull requests"
                      : "You’re all caught up"}
                  </h2>
                  <p>
                    {query
                      ? "Try a different search or another inbox."
                      : "New pull requests will appear here when they need your attention."}
                  </p>
                </div>
              ) : (
                <div className="gh-pr-list">
                  {data.items.map((pr) => (
                    <Link
                      key={pr.html_url}
                      className="gh-pr-row"
                      to={pullRoute(repositoryOf(pr), pr.number)}
                    >
                      <span
                        className={
                          pr.draft ? "text-neutral-500" : "text-emerald-300"
                        }
                      >
                        <PullIcon />
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="gh-pr-title">{pr.title}</span>
                        <span className="gh-pr-meta">
                          {repositoryOf(pr)} <span>#{pr.number}</span>
                          <span>by {pr.user.login}</span>
                          {pr.draft && <span>Draft</span>}
                          {pr.state === "closed" && <span>Closed</span>}
                        </span>
                      </div>
                      <time
                        className="text-xs text-neutral-500 shrink-0"
                        dateTime={pr.updated_at}
                      >
                        {dateLabel(pr.updated_at)}
                      </time>
                      <Icon name="chevron" />
                    </Link>
                  ))}
                </div>
              )}
              <div className="flex justify-between items-center mt-5">
                <Button
                  disabled={page === 1}
                  onClick={() => change(queue.id, query, page - 1)}
                >
                  Previous
                </Button>
                <span className="text-xs text-neutral-400">
                  Page {page}
                  {data.total_count > 1000
                    ? " · Search limited to the first 1,000 results"
                    : ""}
                </span>
                <Button
                  disabled={page * 50 >= Math.min(data.total_count, 1000)}
                  onClick={() => change(queue.id, query, page + 1)}
                >
                  Next
                </Button>
              </div>
            </>
          )
        )}
      </main>
    </div>
  );
}
