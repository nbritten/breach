import type { CiStatus } from "../types";

export function ciPresentation(ci: CiStatus): { label: string; tone: "success" | "failure" | "running" | "neutral"; icon: "check" | "close" | "refresh" | "info" } {
  if (ci.state === "in_progress") return { label: "Checks running", tone: "running", icon: "refresh" };
  if (ci.state === "success") return { label: "Checks passing", tone: "success", icon: "check" };
  if (ci.state === "failure") {
    return { label: ci.conclusion === "timed_out" ? "Checks timed out" : ci.conclusion === "action_required" ? "Checks need action" : "Checks failing", tone: "failure", icon: "close" };
  }
  const labels: Record<string, string> = {
    cancelled: "Checks cancelled", skipped: "Checks skipped", neutral: "Checks neutral", stale: "Checks stale", action_required: "Checks need action", timed_out: "Checks timed out",
  };
  return { label: labels[ci.conclusion ?? ""] ?? "Checks unknown", tone: "neutral", icon: "info" };
}
