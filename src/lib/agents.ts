import type { AgentProvider, AgentSession } from "../types";

/**
 * Display metadata per agent provider — kept in one place so RepoCard,
 * filter chips, and demo fixtures all stay in sync as we add more.
 *
 * `iconPath` is the `d` attribute of the inline SVG mark. The icon is
 * rendered in the provider's brand color via `iconColor`.
 */
export interface AgentInfo {
  label: string;
  iconColor: string;
  iconPath: string;
  // 24x24 viewBox by convention; callers can scale down.
}

export const AGENT_PROVIDER_ORDER: AgentProvider[] = ["claude", "codex"];

export const AGENT_INFO: Record<AgentProvider, AgentInfo> = {
  claude: {
    label: "Claude",
    iconColor: "#D97757",
    // 8-point asterisk — approximation of the Claude wordmark glyph.
    iconPath:
      "M12 1.5 L13.4 8.4 L18.7 4.2 L15.6 10.6 L22.5 12 L15.6 13.4 L18.7 19.8 L13.4 15.6 L12 22.5 L10.6 15.6 L5.3 19.8 L8.4 13.4 L1.5 12 L8.4 10.6 L5.3 4.2 L10.6 8.4 Z",
  },
  codex: {
    label: "Codex",
    iconColor: "#10A37F",
    // Hexagon — a clean, recognizable nod to the OpenAI logo's hexagonal
    // flower without trying to reproduce the licensed mark exactly.
    iconPath: "M12 2 L21 7 L21 17 L12 22 L3 17 L3 7 Z",
  },
};

/**
 * Roll up a list of (provider, repo) sessions into a map from repo path to
 * the set of providers with an active session there. O(N) over the input
 * list; the result is the shape RepoCard, the chip filter, and the count
 * row all consume.
 */
export function agentsByRepo(
  sessions: AgentSession[],
): Record<string, Set<AgentProvider>> {
  const out: Record<string, Set<AgentProvider>> = {};
  for (const s of sessions) {
    if (!out[s.repo_path]) out[s.repo_path] = new Set();
    out[s.repo_path].add(s.provider);
  }
  return out;
}
