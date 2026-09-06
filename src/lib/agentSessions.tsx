import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import { errorText } from "./errors";
import { getReposPath, getScanNestedRepos } from "./settings";
import type { AgentSession, RepoSummary } from "../types";

interface AgentSessionsValue {
  sessions: AgentSession[];
  repos: RepoSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<boolean>;
}

const Context = createContext<AgentSessionsValue | null>(null);

export function AgentSessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [root, scanNested] = await Promise.all([
        getReposPath(),
        getScanNestedRepos(),
      ]);
      const repos = await api.listRepos(root, scanNested);
      setRepos(repos);
      setSessions(
        await api.listActiveAgentSessions(repos.map(({ path }) => path)),
      );
      setError(null);
      return true;
    } catch (cause) {
      setError(errorText(cause));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const value = useMemo(
    () => ({ sessions, repos, loading, error, refresh }),
    [sessions, repos, loading, error, refresh],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAgentSessions(): AgentSessionsValue {
  const value = useContext(Context);
  if (!value)
    throw new Error(
      "useAgentSessions must be used inside AgentSessionsProvider",
    );
  return value;
}
