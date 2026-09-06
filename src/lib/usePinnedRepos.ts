import { useCallback, useEffect, useRef, useState } from "react";
import type { RepoSummary } from "../types";
import { togglePinnedOrder } from "./dashboard";
import { getEffectivePinnedRepos, setEffectivePinnedRepos } from "./settings";

/** Serialize writes across cards so rapid pins cannot overwrite one another. */
export function usePinnedRepos(repos: RepoSummary[]) {
  const [pinnedOrder, setPinnedOrder] = useState<string[]>([]);
  const current = useRef<string[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const revision = useRef(0);
  const pending = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const refreshPins = useCallback(async () => {
    const version = revision.current;
    const pins = await getEffectivePinnedRepos();
    if (version === revision.current && pending.current === 0) {
      current.current = pins;
      if (mounted.current) setPinnedOrder(pins);
    }
  }, []);

  const togglePin = useCallback((key: string) => {
    revision.current += 1;
    pending.current += 1;
    const operation = queue.current.catch(() => {}).then(async () => {
      const repo = repos.find((candidate) => candidate.path === key || candidate.name === key);
      if (!repo) throw new Error("This repository is no longer available.");
      const next = togglePinnedOrder(repo, repos, current.current);
      await setEffectivePinnedRepos(next);
      current.current = next;
      if (mounted.current) setPinnedOrder(next);
    }).finally(() => { pending.current -= 1; });
    queue.current = operation;
    return operation;
  }, [repos]);

  return { pinnedOrder, refreshPins, togglePin };
}
