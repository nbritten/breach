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

export interface DiffSide {
  lineNumber: number | null;
  text: string;
  kind: "context" | "addition" | "deletion" | "empty";
}

export type SplitDiffRow =
  | { kind: "hunk"; text: string }
  | { kind: "lines"; old: DiffSide; new: DiffSide };

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
  const files: ParsedFile[] = [];
  let sectionStart = raw.indexOf("diff --git ");

  while (sectionStart !== -1) {
    const nextSection = raw.indexOf("\ndiff --git ", sectionStart + 1);
    const sectionEnd = nextSection === -1 ? raw.length : nextSection + 1;
    const body = raw.slice(sectionStart, sectionEnd);
    const headerEnd = body.indexOf("\n");
    const headerLine = headerEnd === -1 ? body : body.slice(0, headerEnd);
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
    for (const l of body.split("\n")) {
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
      body,
      additions,
      deletions,
    });
    sectionStart = nextSection === -1 ? -1 : nextSection + 1;
  }

  return files;
}

const EMPTY_SIDE: DiffSide = {
  lineNumber: null,
  text: "",
  kind: "empty",
};

/**
 * Convert unified hunks to aligned split-view rows. This deliberately parses
 * only a mounted file, unlike the previous diff library which built multiple
 * full line models for every visible file. Metadata before the first hunk is
 * skipped because the file card already renders it more compactly.
 */
export function parseSplitDiff(body: string): SplitDiffRow[] {
  const rows: SplitDiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  let deletions: DiffSide[] = [];
  let additions: DiffSide[] = [];

  const flushChanges = () => {
    const count = Math.max(deletions.length, additions.length);
    for (let i = 0; i < count; i++) {
      rows.push({
        kind: "lines",
        old: deletions[i] ?? EMPTY_SIDE,
        new: additions[i] ?? EMPTY_SIDE,
      });
    }
    deletions = [];
    additions = [];
  };

  for (const line of body.split("\n")) {
    if (line.startsWith("@@")) {
      flushChanges();
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      oldLine = Number(match?.[1] ?? 0);
      newLine = Number(match?.[2] ?? 0);
      inHunk = true;
      rows.push({ kind: "hunk", text: line });
      continue;
    }
    if (!inHunk) continue;

    if (line.startsWith("-")) {
      deletions.push({
        lineNumber: oldLine++,
        text: line.slice(1),
        kind: "deletion",
      });
    } else if (line.startsWith("+")) {
      additions.push({
        lineNumber: newLine++,
        text: line.slice(1),
        kind: "addition",
      });
    } else if (line.startsWith(" ")) {
      flushChanges();
      rows.push({
        kind: "lines",
        old: { lineNumber: oldLine++, text: line.slice(1), kind: "context" },
        new: { lineNumber: newLine++, text: line.slice(1), kind: "context" },
      });
    } else if (line.startsWith("\\ No newline")) {
      flushChanges();
      rows.push({ kind: "hunk", text: line });
    }
  }
  flushChanges();
  return rows;
}

/**
 * Files with more changed lines than this aren't rendered at all until the
 * user asks. The lightweight renderer is linear and allocation-conscious, but
 * deferring generated files still avoids mounting thousands of DOM rows.
 */
export const RENDER_CHANGED_LINE_LIMIT = 2000;

export function shouldDeferDiff(
  file: Pick<ParsedFile, "additions" | "deletions">,
): boolean {
  return file.additions + file.deletions > RENDER_CHANGED_LINE_LIMIT;
}
