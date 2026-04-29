import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import {
  buildServiceUrl,
  getPinnedRepos,
  getRepoOrgs,
  getReposPath,
  getServiceRepos,
  getServiceUrlTemplate,
  setPinnedRepos,
} from "../lib/settings";
import { useSearch } from "../lib/search";
import { useToast } from "../lib/toast";
import { errorText } from "../lib/errors";
import { usePrNotificationsPoll } from "../lib/hooks";

import { RepoCard } from "../components/RepoCard";
import { SyncAllModal } from "../components/SyncAllModal";
import { CloneMissingModal } from "../components/CloneMissingModal";
import { EmptyState } from "../components/EmptyState";
import { Tooltip } from "../components/Tooltip";
import type { CiStatus, MyPrs, PrInfo, RepoSummary } from "../types";
import { filterRepos, groupRepos } from "../lib/dashboard";

const EMPTY_PRS: PrInfo[] = [];

export function Dashboard() {
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reposPath, setPath] = useState<string>("");
  const [showSyncAll, setShowSyncAll] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const [pinnedOrder, setPinnedOrder] = useState<string[]>([]);
  const [orgs, setOrgs] = useState<string[]>([]);
  const [prs, setPrs] = useState<MyPrs>({ authored: {}, review_requested: {}, errors: {} });
  const [ciByPath, setCiByPath] = useState<Record<string, CiStatus>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [serviceTpl, setServiceTpl] = useState("");
  const [serviceSet, setServiceSet] = useState<Set<string>>(new Set());
  const { showError } = useToast();

  const togglePin = useCallback(
    async (name: string) => {
      const next = pinnedOrder.includes(name)
        ? pinnedOrder.filter((n) => n !== name)
        : [...pinnedOrder, name];
      setPinnedOrder(next);
      await setPinnedRepos(next);
    },
    [pinnedOrder],
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

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const path = await getReposPath();
      setPath(path);
      const [list, pinned, nextOrgs, tpl, services] = await Promise.all([
        api.listRepos(path),
        getPinnedRepos(),
        getRepoOrgs(),
        getServiceUrlTemplate(),
        getServiceRepos(),
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
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [refreshPrs]);

  usePrNotificationsPoll(orgs.length > 0, 30_000, () => refreshPrs(orgs));

  const refreshOne = useCallback(async (path: string) => {
    const updated = await api.repoSummary(path);
    setRepos((prev) => prev.map((r) => (r.path === path ? updated : r)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const dirtyCount = repos.filter((r) => r.dirty).length;
  const { query } = useSearch();

  const filteredRepos = useMemo(
    () => filterRepos(repos, query),
    [repos, query],
  );

  const sections = useMemo(
    () => groupRepos(filteredRepos, pinnedOrder),
    [filteredRepos, pinnedOrder],
  );

  const toggle = (key: string) =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Repositories</h1>
          <p className="text-xs text-neutral-500 font-mono">{reposPath}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {repos.length > 0 && (
            <span className="text-neutral-500">
              {repos.length} repos · {dirtyCount} dirty
            </span>
          )}
          <Tooltip content="Open your repos directory in a terminal (Ghostty if installed, else Terminal.app).">
            <button
              onClick={() => reposPath && api.openInTerminal(reposPath).catch(showError)}
              disabled={!reposPath}
              className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
              Terminal
            </button>
          </Tooltip>
          <Tooltip content="Lists repos in your configured GitHub orgs via gh and clones any pinned ones that aren't local yet. Without pins, clones every non-archived repo.">
            <button
              onClick={() => setShowClone(true)}
              disabled={loading}
              className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 disabled:opacity-50"
            >
              Clone missing
            </button>
          </Tooltip>
          <Tooltip
            content={
              pinnedOrder.length > 0
                ? "For each pinned repo: git fetch origin <default>, checkout <default>, merge --ff-only. Skips any dirty repo."
                : "For every local repo: git fetch origin <default>, checkout <default>, merge --ff-only. Skips any dirty repo."
            }
          >
            <button
              onClick={() => setShowSyncAll(true)}
              disabled={loading || repos.length === 0}
              className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 disabled:opacity-50"
            >
              {pinnedOrder.length > 0
                ? `Sync pinned (${pinnedOrder.length})`
                : "Sync all"}
            </button>
          </Tooltip>
          <Tooltip content="Re-scans local repos (git status), re-queries PRs and CI, and reloads settings. Doesn't fetch from origin — use Sync for that.">
            <button
              onClick={refresh}
              disabled={loading}
              className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </Tooltip>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        {error ? (
          <div className="text-rose-400 text-sm">{error}</div>
        ) : repos.length === 0 && !loading ? (
          <EmptyState
            size="lg"
            title="No repositories yet"
            subtitle={
              <>
                Nothing in <code className="font-mono">{reposPath}</code>. Configure an org in
                Settings and hit Clone missing to get started.
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
                      <h2 className="text-sm font-semibold tracking-wide uppercase text-neutral-300 group-hover:text-neutral-100">
                        {s.label}
                      </h2>
                      <span className="text-xs text-neutral-500">
                        {s.repos.length}
                      </span>
                      <div className="flex-1 border-b border-neutral-800 ml-2" />
                    </button>
                  )}
                  {isOpen && (
                    s.repos.length === 0 ? (
                      <div className="text-xs text-neutral-600 italic pl-5">
                        No local clones.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {s.repos.map((r) => (
                          <RepoCard
                            key={r.path}
                            repo={r}
                            onRefresh={refreshOne}
                            authoredPrs={prs.authored[r.name] ?? EMPTY_PRS}
                            reviewPrs={prs.review_requested[r.name] ?? EMPTY_PRS}
                            pinned={pinnedOrder.includes(r.name)}
                            onTogglePin={togglePin}
                            ci={ciByPath[r.path]}
                            docsUrl={
                              serviceSet.has(r.name)
                                ? buildServiceUrl(serviceTpl, r.name)
                                : null
                            }
                          />
                        ))}
                      </div>
                    )
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>

      {showSyncAll && (
        <SyncAllModal
          reposPath={reposPath}
          onClose={() => {
            setShowSyncAll(false);
            refresh();
          }}
        />
      )}

      {showClone && (
        <CloneMissingModal
          reposPath={reposPath}
          onClose={() => {
            setShowClone(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
