import { describe, expect, it } from "vitest";
import { agentNeedsAttention, sortAgentSessions } from "./agents";
import type { AgentSession, AgentState } from "../types";

function session(id: string, state: AgentState, updated_at = 0): AgentSession {
  return {
    id,
    state,
    updated_at,
    provider: "codex",
    repo_path: `/repos/${id}`,
    cwd: `/repos/${id}`,
    pid: Number(id.replace(/\D/g, "")) || 1,
  };
}

describe("agent attention", () => {
  it("only marks states that require human action", () => {
    expect(agentNeedsAttention(session("1", "needs_input"))).toBe(true);
    expect(agentNeedsAttention(session("2", "needs_approval"))).toBe(true);
    expect(agentNeedsAttention(session("3", "failed"))).toBe(true);
    expect(agentNeedsAttention(session("4", "working"))).toBe(false);
    expect(agentNeedsAttention(session("5", "completed"))).toBe(false);
  });

  it("sorts attention first and newer sessions first within a state", () => {
    const sorted = sortAgentSessions([
      session("working", "working", 30),
      session("old-question", "needs_input", 10),
      session("done", "completed", 40),
      session("new-question", "needs_approval", 20),
    ]);
    expect(sorted.map(({ id }) => id)).toEqual([
      "new-question",
      "old-question",
      "working",
      "done",
    ]);
  });
});
