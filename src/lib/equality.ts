/**
 * Cheap structural equality for JSON-shaped values (primitives, arrays, and
 * plain objects — no Dates, Maps, or cycles). Used by the dashboard's poll
 * setters to keep state identity stable when a poll returns the same payload
 * as last time: the backend always hands us freshly-parsed objects, so
 * without this every tick would invalidate downstream useMemo chains and
 * re-render the whole card grid even when nothing changed.
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;
  if (aIsArray) {
    const arrA = a as unknown[];
    const arrB = b as unknown[];
    if (arrA.length !== arrB.length) return false;
    return arrA.every((v, i) => jsonEqual(v, arrB[i]));
  }
  const recA = a as Record<string, unknown>;
  const recB = b as Record<string, unknown>;
  const keysA = Object.keys(recA);
  if (keysA.length !== Object.keys(recB).length) return false;
  return keysA.every(
    (k) => Object.prototype.hasOwnProperty.call(recB, k) && jsonEqual(recA[k], recB[k]),
  );
}
