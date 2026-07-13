export interface ParsedFile {
  oldPath: string;
  newPath: string;
  displayName: string;
  status: "added" | "deleted" | "renamed" | "modified";
  isBinary: boolean;
  body: string;
  /** Number of `+` lines inside hunks. Counted here so the UI can show
   * per-file stats without paying for a DiffFile instance first. */
  additions: number;
  /** Number of `-` lines inside hunks. */
  deletions: number;
}

const stripQuotes = (p: string) => {
  if (p.startsWith('"') && p.endsWith('"')) return p.slice(1, -1);
  return p;
};

const parseGitHeader = (line: string): { a: string; b: string } => {
  const rest = line.slice("diff --git ".length).trim();
  const mid = rest.indexOf(" b/");
  if (mid === -1 || !rest.startsWith("a/")) {
    return { a: rest, b: rest };
  }
  const a = stripQuotes(rest.slice(2, mid));
  const b = stripQuotes(rest.slice(mid + 3));
  return { a, b };
};

export function parseUnifiedDiff(raw: string): ParsedFile[] {
  if (!raw.trim()) return [];
  const lines = raw.split("\n");
  const files: ParsedFile[] = [];
  let headerLine: string | null = null;
  let body: string[] = [];

  const flush = () => {
    if (!headerLine) return;
    const { a, b } = parseGitHeader(headerLine);
    let status: ParsedFile["status"] = "modified";
    let isBinary = false;
    let additions = 0;
    let deletions = 0;

    // Header metadata (`new file mode`, `rename from`, `--- a/...`) only
    // appears before the first `@@` hunk marker, and `+`/`-` content lines
    // only appear after it. Tracking that boundary lets us count changed
    // lines without misreading `+++`/`---` file markers — or a removed line
    // whose content happens to start with `--` — as change lines.
    let inHunk = false;
    for (const l of body) {
      if (l.startsWith("@@")) {
        inHunk = true;
        continue;
      }
      if (inHunk) {
        if (l.startsWith("+")) additions++;
        else if (l.startsWith("-")) deletions++;
      } else if (l.startsWith("new file mode")) status = "added";
      else if (l.startsWith("deleted file mode")) status = "deleted";
      else if (l.startsWith("rename from") || l.startsWith("rename to")) status = "renamed";
      else if (l.startsWith("Binary files ")) isBinary = true;
    }

    const displayName = status === "deleted" ? a : b;
    files.push({
      oldPath: a,
      newPath: b,
      displayName,
      status,
      isBinary,
      body: body.join("\n"),
      additions,
      deletions,
    });
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      flush();
      headerLine = line;
      body = [line];
    } else if (headerLine) {
      body.push(line);
    }
  }
  flush();

  return files;
}

// Everything in @git-diff-view (DiffFile.init, buildSplitDiffLines) and shiki
// (initSyntax) runs synchronously on the main thread, so per-file cost scales
// directly with changed-line count. These thresholds decide how much of that
// work a file gets. Both are heuristics, not exact budgets — the goal is to
// keep a single giant lockfile or generated file from freezing the window.

/**
 * Files with more changed lines than this still render, but skip shiki
 * syntax highlighting (plain +/- coloring only). Highlighting is by far the
 * most expensive per-file step — shiki tokenizes both sides of the split
 * view — and past a few hundred lines nobody is reading token colors anyway.
 */
export const HIGHLIGHT_CHANGED_LINE_LIMIT = 500;

/**
 * Files with more changed lines than this aren't rendered at all until the
 * user asks: even building the DiffFile line model for a multi-thousand-line
 * lockfile takes long enough to visibly jank the UI. ~2000 lines keeps every
 * hand-written diff eagerly visible while deferring the generated-file cases
 * that caused freezes.
 */
export const RENDER_CHANGED_LINE_LIMIT = 2000;

export type DiffRenderMode = "full" | "plain" | "deferred";

/** Classify how eagerly a parsed file should be rendered (see the threshold
 * constants above for the reasoning behind each tier). */
export function diffRenderMode(file: Pick<ParsedFile, "additions" | "deletions">): DiffRenderMode {
  const changed = file.additions + file.deletions;
  if (changed > RENDER_CHANGED_LINE_LIMIT) return "deferred";
  if (changed > HIGHLIGHT_CHANGED_LINE_LIMIT) return "plain";
  return "full";
}
