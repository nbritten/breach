export interface PatchLine {
  text: string;
  kind: "hunk" | "addition" | "deletion" | "context" | "meta";
  old: number | null;
  next: number | null;
}
export function patchLines(patch: string): PatchLine[] {
  let old = 0,
    next = 0,
    hunk = false;
  return patch.split("\n").map((text) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (match) {
      old = Number(match[1]);
      next = Number(match[2]);
      hunk = true;
      return { text, kind: "hunk", old: null, next: null };
    }
    if (!hunk || text.startsWith("\\") || !/^[ +\-]/.test(text))
      return { text, kind: "meta", old: null, next: null };
    if (text.startsWith("+"))
      return { text, kind: "addition", old: null, next: next++ };
    if (text.startsWith("-"))
      return { text, kind: "deletion", old: old++, next: null };
    return { text, kind: "context", old: old++, next: next++ };
  });
}
