export interface ParsedFile {
  oldPath: string;
  newPath: string;
  displayName: string;
  status: "added" | "deleted" | "renamed" | "modified";
  isBinary: boolean;
  body: string;
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

    for (const l of body) {
      if (l.startsWith("new file mode")) status = "added";
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
