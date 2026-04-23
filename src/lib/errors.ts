/**
 * Normalize unknown thrown values into a readable string. Preserves Error.message
 * when available, falls back to a stable representation otherwise.
 */
export function errorText(e: unknown): string {
  if (e == null) return "Unknown error";
  if (e instanceof Error) return e.message || e.toString();
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
