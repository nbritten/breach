import { TerminalLaunchButton } from "../components/TerminalLaunchButton";
import { RefreshButton } from "../components/RefreshButton";
import { Button } from "../components/Button";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import {
  buildServiceUrl,
  getEffectivePinnedRepos,
  getRepoOrgs,
  getReposPath,
  getScanNestedRepos,
  getGroupNestedRepos,
  getServiceRepos,
  getServiceUrlTemplate,
  setEffectivePinnedRepos,
} from "../lib/settings";
import { useSearch } from "../lib/search";
import { errorText } from "../lib/errors";
import {
  useActiveAgentSessionsPoll,
  useCiStatusPoll,
  usePrNotificationsPoll,
} from "../lib/hooks";
import { agentsByRepo } from "../lib/agents";
import { jsonEqual } from "../lib/equality";
import { useTerminalSession } from "../lib/terminalSession";

import { RepoCard } from "../components/RepoCard";
import { EmptyState } from "../components/EmptyState";
import { Tooltip } from "../components/Tooltip";
import type {
  AgentProvider,
  AgentSession,
  CiStatus,
  MyPrs,
  RepoSummary,
} from "../types";
import {
  filterByChips,
  filterRepos,
  groupRepos,
  isRepoPinned,
  matchesIdentityKey,
  prsForRepo,
  repoPinKey,
  repoPathLabel,
  sortRepos,
  togglePinnedOrder,
  REPO_FILTER_ORDER,
  repoFilterLabel,
  repoFilterCounts,
  type RepoFilter,
} from "../lib/dashboard";

const SyncAllModal = lazy(() =>
  import("../components/SyncAllModal").then((module) => ({
    default: module.SyncAllModal,
  })),
);
const CloneMissingModal = lazy(() =>
  import("../components/CloneMissingModal").then((module) => ({
    default: module.CloneMissingModal,
  })),
);
export function Dashboard() {
  const navigate = useNavigate();
  const { sessions: terminalSessions, open: openEmbeddedTerminal } =
    useTerminalSession();
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reposPath, setPath] = useState<string>("");
  const [scanNested, setScanNested] = useState(false);
  const [groupNested, setGroupNested] = useState(true);
  const [showSyncAll, setShowSyncAll] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const [pinnedOrder, setPinnedOrder] = useState<string[]>([]);
  const [orgs, setOrgs] = useState<string[]>([]);
  const [prs, setPrs] = useState<MyPrs>({ authored: {}, review_requested: {}, errors: {} });
  const [ciByPath, setCiByPath] = useState<Record<string, CiStatus>>({});
  const [agentSessions, setAgentSessions] = useState<AgentSession[]>([]);
  const agentsByPath = useMemo<
    Record<string, Set<AgentProvider>>
  >(() => agentsByRepo(agentSessions), [agentSessions]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [serviceTpl, setServiceTpl] = useState("");
  const [serviceSet, setServiceSet] = useState<Set<string>>(new Set());
  const terminalPaths = useMemo(
    () =>
      new Set(
        terminalSessions
          .filter((session) => session.status === "running")
          .map((session) => session.cwd),
      ),
    [terminalSessions],
  );
  const openBreachTerminal = useCallback(
    async (path: string) => {
      await openEmbeddedTerminal(path);
      navigate("/terminal");
    },
    [navigate, openEmbeddedTerminal],
  );

  const togglePin = useCallback(
    async (key: string) => {
      const repo = repos.find((r) => r.path === key || r.name === key);
      if (!repo) return;
      const next = togglePinnedOrder(repo, repos, pinnedOrder);
      setPinnedOrder(next);
      // setEffectivePinnedRepos routes to either the real settings store or
      // demo mode's in-memory store, so pinning during a demo session updates
      // the dashboard without leaking demo names into real pinnedRepos.
      await setEffectivePinnedRepos(next);
    },
    [pinnedOrder, repos],
  );

  const refreshPrs = useCallback((forOrgs: string[]) => {
    if (forOrgs.length === 0) {
      setPrs({ authored: {}, review_requested: {}, errors: {} });
      return;
    }
    api
      .listMyPrs(forOrgs)
      .then(setPrs)
      .catch((err) => {
        console.warn("PR fetch failed", err);
        setPrs({ authored: {}, review_requested: {}, errors: {} });
      });
  }, []);

  // Timestamp of the last completed refresh, used by the focus handler to
  // skip redundant full refreshes. A ref (not state) because reading it must
  // never re-render and the focus listener wants a stable closure.
  const lastRefreshAt = useRef(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The settings reads don't depend on the repos path — kick them off
      // first so only listRepos has to wait for the path lookup.
      const settingsReads = Promise.all([
        getEffectivePinnedRepos(),
        getRepoOrgs(),
        getServiceUrlTemplate(),
        getServiceRepos(),
      ]);
      // If getReposPath throws we bail before awaiting settingsReads; the
      // no-op catch keeps that from surfacing as an unhandled rejection.
      settingsReads.catch(() => {});
      const [path, nested, group] = await Promise.all([
        getReposPath(),
        getScanNestedRepos(),
        getGroupNestedRepos(),
      ]);
      setPath(path);
      setScanNested(nested);
      setGroupNested(group);
      const [list, [pinned, nextOrgs, tpl, services]] = await Promise.all([
        api.listRepos(path, nested),
        settingsReads,
      ]);
      setRepos(list);
      setPinnedOrder(pinned);
      setOrgs(nextOrgs);
      setServiceTpl(tpl);
      setServiceSet(new Set(services));
      refreshPrs(nextOrgs);
      const ciReqs = list
        .filter((r) => r.branch)
        .map((r) => ({ path: r.path, branch: r.branch as string }));
      if (ciReqs.length > 0) {
        api
          .listCiStatus(ciReqs)
          .then(setCiByPath)
          .catch((err) => {
            console.warn("CI fetch failed", err);
            setCiByPath({});
          });
      } else {
        setCiByPath({});
      }
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      lastRefreshAt.current = Date.now();
      setLoading(false);
    }
  }, [refreshPrs]);

  usePrNotificationsPoll(orgs.length > 0, 30_000, () => refreshPrs(orgs));

  useCiStatusPoll(
    repos.length > 0,
    90_000,
    () =>
      repos
        .filter((r) => r.branch)
        .map((r) => ({ path: r.path, branch: r.branch as string })),
    // Merge rather than replace: list_ci_status drops repos whose gh call
    // errored or returned no runs, so a transient gh hiccup on any one repo
    // would otherwise wipe its dot until the next tick. Full refresh()
    // (focus / watcher) still uses replace and prunes stale keys.
    // Keep the previous object when the merge is a no-op — every tick builds
    // fresh objects, and swapping identity for identical content would
    // invalidate filterCounts/filteredRepos/sections and re-render every
    // RepoCard for nothing.
    (result) =>
      setCiByPath((prev) => {
        const merged = { ...prev, ...result };
        return jsonEqual(prev, merged) ? prev : merged;
      }),
  );

  // Agent session detection is a cheap targeted `lsof` check, so a
  // tighter cadence than CI is fine. 15s feels live without being noisy.
  // Sessions are usually unchanged tick to tick, but the poll returns a
  // fresh array each time — keep the old identity when the content matches
  // so agentsByPath (and everything memoized off it) stays stable on idle.
  useActiveAgentSessionsPoll(
    repos.length > 0,
    15_000,
    () => repos.map((r) => r.path),
    (result) =>
      setAgentSessions((prev) => (jsonEqual(prev, result) ? prev : result)),
  );

  // Single-repo refresh is best-effort: if the repo was deleted between the
  // watcher event and our refetch, repoSummary errors out — fall back to a
  // full re-list so the deleted card is removed instead of going stale.
  const refreshRef = useRef<() => void>(() => {});
  const refreshOne = useCallback(async (path: string) => {
    try {
      const updated = await api.repoSummary(path);
      setRepos((prev) => prev.map((r) => (r.path === path ? updated : r)));
    } catch {
      refreshRef.current();
      throw new Error("This repository could not be refreshed. The repository list is being reloaded.");
    }
  }, []);
  refreshRef.current = refresh;

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Catch sleep/wake gaps and "tabbed away for an hour" cases the watcher
  // can't cover on its own — FSEvents occasionally misses across sleep, and
  // remote-driven state (PRs, CI) doesn't show up in the local filesystem.
  // Throttled: a full refresh spawns one git subprocess per repo plus one gh
  // call per repo, so rapid cmd-tabbing must not fire it on every focus.
  // Anything fresher than 30s is plenty for the stale-window case above.
  useEffect(() => {
    const FOCUS_REFRESH_MIN_GAP_MS = 30_000;
    const onFocus = () => {
      if (Date.now() - lastRefreshAt.current < FOCUS_REFRESH_MIN_GAP_MS) return;
      refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  // Start (or restart, on path change) the backend filesystem watcher so we
  // get push-style updates instead of relying on the Refresh button.
  useEffect(() => {
    if (!reposPath) return;
    api.startReposWatcher(reposPath, scanNested).catch((err) => {
      console.warn("startReposWatcher failed", err);
    });
  }, [reposPath, scanNested]);

  // Listen for repo-changed events emitted by the watcher and re-fetch just
  // the affected repo. Reads the latest repo list via a ref so the listener
  // doesn't need to re-bind on every state change. An event for a path we
  // don't have yet (new clone, removed dir) triggers a full re-list.
  //
  // Both paths are coalesced, because the watcher fires per filesystem event
  // and a checkout / npm install / coding-agent run is a burst of hundreds:
  // - Known repos get a trailing-edge debounce per path (one timer each), so
  //   a burst costs one repoSummary call ~500ms after it quiets down.
  // - Unknown paths (repo mid-clone, non-repo dir) get a leading-edge
  //   throttle on the full refresh — at most one re-list per 5s, since a
  //   clone in progress can otherwise re-trigger it every 250ms.
  const reposRef = useRef(repos);
  reposRef.current = repos;
  useEffect(() => {
    const REFRESH_ONE_DEBOUNCE_MS = 500;
    const UNKNOWN_PATH_REFRESH_GAP_MS = 5_000;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    const debounceTimers = new Map<string, number>();
    let lastUnknownRefreshAt = 0;
    listen<{ path: string }>("repo-changed", (event) => {
      const path = event.payload.path;
      if (reposRef.current.some((r) => r.path === path)) {
        const pending = debounceTimers.get(path);
        if (pending !== undefined) window.clearTimeout(pending);
        debounceTimers.set(
          path,
          window.setTimeout(() => {
            debounceTimers.delete(path);
            void refreshOne(path).catch(() => {});
          }, REFRESH_ONE_DEBOUNCE_MS),
        );
      } else if (Date.now() - lastUnknownRefreshAt >= UNKNOWN_PATH_REFRESH_GAP_MS) {
        lastUnknownRefreshAt = Date.now();
        refresh();
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
      for (const id of debounceTimers.values()) window.clearTimeout(id);
      debounceTimers.clear();
    };
  }, [refresh, refreshOne]);

  const dirtyCount = useMemo(
    () => repos.reduce((count, repo) => count + Number(repo.dirty), 0),
    [repos],
  );
  const { query } = useSearch();
  const [activeFilters, setActiveFilters] = useState<Set<RepoFilter>>(
    new Set(),
  );

  const toggleFilter = (f: RepoFilter) =>
    setActiveFilters((prev) => {
      const next = new Set(prev);
      next.has(f) ? next.delete(f) : next.add(f);
      return next;
    });

  const orderedRepos = useMemo(
    () => sortRepos(repos, scanNested && groupNested),
    [repos, scanNested, groupNested],
  );

  // Counts come from the search-filtered set, not the chip-filtered set, so
  // the count next to "Dirty" is "dirty among repos matching your search",
  // not "dirty among repos already filtered by other active chips" (which
  // would create weird interactions where activating Behind shrinks the Dirty
  // count).
  const searchFiltered = useMemo(
    () => filterRepos(orderedRepos, query),
    [orderedRepos, query],
  );

  const filterCounts = useMemo(
    () => repoFilterCounts(searchFiltered, prs, ciByPath, agentsByPath),
    [searchFiltered, prs, ciByPath, agentsByPath],
  );

  const filteredRepos = useMemo(
    () =>
      filterByChips(searchFiltered, activeFilters, prs, ciByPath, agentsByPath),
    [searchFiltered, activeFilters, prs, ciByPath, agentsByPath],
  );

  const sections = useMemo(
    () => groupRepos(filteredRepos, pinnedOrder, repos),
    [filteredRepos, pinnedOrder, repos],
  );

  const toggle = (key: string) =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  return (
    <div className="flex flex-col h-full">
      <header className="page-header border-b border-neutral-800 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Repositories</h1>
          <p className="text-xs text-neutral-500 font-mono">{reposPath}</p>
        </div>
        <div className="page-actions flex flex-wrap items-center gap-2 text-sm">
          {repos.length > 0 && (
            <span className="repo-summary text-xs text-neutral-400">
              {repos.length} repositories · {dirtyCount} changed
            </span>
          )}
          <TerminalLaunchButton path={reposPath} onOpen={openBreachTerminal} />
          <TerminalLaunchButton path={reposPath} external iconOnly />
          <Tooltip content="Lists every non-archived repo in your configured GitHub accounts (orgs or users) that isn't local yet, then lets you pick which ones to clone.">
            <Button
              onClick={() => setShowClone(true)}
              disabled={loading}
              variant="secondary"
            >
              Clone missing
            </Button>
          </Tooltip>
          <Tooltip
            content={
              pinnedOrder.length > 0
                ? "For each pinned repo: git fetch origin <default>, checkout <default>, merge --ff-only. Skips any repo with changes."
                : "For every local repo: git fetch origin <default>, checkout <default>, merge --ff-only. Skips any repo with changes."
            }
          >
            <Button
              onClick={() => setShowSyncAll(true)}
              disabled={loading || repos.length === 0}
              variant="secondary"
            >
              {pinnedOrder.length > 0
                ? `Sync pinned (${pinnedOrder.length})`
                : "Sync all"}
            </Button>
          </Tooltip>
          <RefreshButton onRefresh={refresh} busy={loading} iconOnly={false} description="Refresh local repositories. Pull requests and checks also update in the background." />
        </div>
      </header>

      <main className="dashboard-content flex-1 overflow-auto">
        {repos.length > 0 &&
          REPO_FILTER_ORDER.some(
            (f) => filterCounts[f] > 0 || activeFilters.has(f),
          ) && (
            <div className="filter-bar flex flex-wrap gap-2 mb-6">
              {REPO_FILTER_ORDER.map((f) => {
                const count = filterCounts[f];
                const active = activeFilters.has(f);
                // Hide chips with zero matches unless they're active — keeps
                // the row quiet on a clean dashboard but never strands a
                // chip the user toggled into a no-match state.
                if (count === 0 && !active) return null;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFilter(f)}
                    aria-pressed={active}
                    className={`filter-chip ${active ? "is-active" : ""}`}
                  >
                    {repoFilterLabel(f)}{" "}
                    <span className="opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        {error ? (
          <div className="text-rose-400 text-sm">{error}</div>
        ) : repos.length === 0 && !loading ? (
          <EmptyState
            size="lg"
            title="No repositories yet"
            subtitle={
              <>
                Nothing in <code className="font-mono">{reposPath}</code>. Add a GitHub
                account in Settings and hit Clone missing to get started.
              </>
            }
          />
        ) : filteredRepos.length === 0 && query.trim() ? (
          <EmptyState
            size="md"
            title={
              <>
                No repos match <span className="font-mono">"{query}"</span>
              </>
            }
            subtitle="Try a different name or branch. Press Esc to clear."
          />
        ) : filteredRepos.length === 0 && activeFilters.size > 0 ? (
          <EmptyState
            size="md"
            title="No repos match the active filters"
            subtitle="Toggle a chip off above to widen the view."
          />
        ) : (
          <div className="flex flex-col gap-6">
            {sections.map((s) => {
              const isOpen = !collapsed[s.key];
              const showHeader = s.label.length > 0;
              return (
                <section key={s.key}>
                  {showHeader && (
                    <button
                      onClick={() => toggle(s.key)}
                      aria-label={
                        isOpen ? `Collapse ${s.label}` : `Expand ${s.label}`
                      }
                      aria-expanded={isOpen}
                      className="w-full mb-3 flex items-center gap-2 text-left group"
                    >
                      <span className="text-neutral-500 text-xs font-mono w-3">
                        {isOpen ? "▾" : "▸"}
                      </span>
                      <h2 className="text-xs font-medium text-neutral-400 group-hover:text-neutral-100">
                        {s.label}
                      </h2>
                      <span className="text-xs text-neutral-500">
                        {s.repos.length}
                      </span>
                      <div className="flex-1 border-b border-neutral-800 ml-2" />
                    </button>
                  )}
                  {isOpen && (
                    <div className="repo-grid">
                      {s.repos.map((r) => (
                        <RepoCard
                          key={r.path}
                          repo={r}
                          onRefresh={refreshOne}
                          authoredPrs={prsForRepo(r, prs.authored)}
                          reviewPrs={prsForRepo(r, prs.review_requested)}
                          pinned={isRepoPinned(r, pinnedOrder, repos)}
                          onTogglePin={togglePin}
                          pinKey={repoPinKey(r, repos)}
                          pathLabel={repoPathLabel(r, repos)}
                          ci={ciByPath[r.path]}
                          activeAgents={agentsByPath[r.path]}
                          docsUrl={
                            matchesIdentityKey(r, [...serviceSet], repos)
                              ? buildServiceUrl(serviceTpl, r.name)
                              : null
                          }
                          terminalActive={terminalPaths.has(r.path)}
                          onOpenTerminal={openBreachTerminal}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>

      {showSyncAll && (
        <Suspense fallback={null}>
          <SyncAllModal
            reposPath={reposPath}
            onClose={() => {
              setShowSyncAll(false);
              refresh();
            }}
          />
        </Suspense>
      )}

      {showClone && (
        <Suspense fallback={null}>
          <CloneMissingModal
            reposPath={reposPath}
            scanNested={scanNested}
            onClose={() => {
              setShowClone(false);
              refresh();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
