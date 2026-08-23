import { describe, expect, it } from "vitest";
import {
  parseSplitDiff,
  parseUnifiedDiff,
  RENDER_CHANGED_LINE_LIMIT,
  shouldDeferDiff,
} from "./parseDiff";

describe("parseUnifiedDiff", () => {
  it("returns empty for blank input", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
    expect(parseUnifiedDiff("   \n  ")).toEqual([]);
  });

  it("parses a simple single-file modified diff", () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
index abc..def 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,3 @@
 line one
-old
+new
 line three
`;
    const files = parseUnifiedDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].oldPath).toBe("src/foo.ts");
    expect(files[0].newPath).toBe("src/foo.ts");
    expect(files[0].displayName).toBe("src/foo.ts");
    expect(files[0].status).toBe("modified");
    expect(files[0].isBinary).toBe(false);
  });

  it("detects new files", () => {
    const diff = `diff --git a/new.txt b/new.txt
new file mode 100644
index 0000000..abcdef
--- /dev/null
+++ b/new.txt
@@ -0,0 +1 @@
+hello
`;
    const files = parseUnifiedDiff(diff);
    expect(files[0].status).toBe("added");
    expect(files[0].displayName).toBe("new.txt");
  });

  it("detects deleted files", () => {
    const diff = `diff --git a/gone.txt b/gone.txt
deleted file mode 100644
index abcdef..0000000
--- a/gone.txt
+++ /dev/null
@@ -1 +0,0 @@
-bye
`;
    const files = parseUnifiedDiff(diff);
    expect(files[0].status).toBe("deleted");
    expect(files[0].displayName).toBe("gone.txt");
  });

  it("detects renames", () => {
    const diff = `diff --git a/old.txt b/new.txt
similarity index 100%
rename from old.txt
rename to new.txt
`;
    const files = parseUnifiedDiff(diff);
    expect(files[0].status).toBe("renamed");
    expect(files[0].oldPath).toBe("old.txt");
    expect(files[0].newPath).toBe("new.txt");
  });

  it("detects binary files", () => {
    const diff = `diff --git a/image.png b/image.png
index abc..def 100644
Binary files a/image.png and b/image.png differ
`;
    const files = parseUnifiedDiff(diff);
    expect(files[0].isBinary).toBe(true);
  });

  it("parses multiple files in one diff", () => {
    const diff = `diff --git a/a.ts b/a.ts
index 111..222 100644
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-a
+A
diff --git a/b.ts b/b.ts
index 333..444 100644
--- a/b.ts
+++ b/b.ts
@@ -1 +1 @@
-b
+B
`;
    const files = parseUnifiedDiff(diff);
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.newPath)).toEqual(["a.ts", "b.ts"]);
  });

  it("counts additions and deletions per file", () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
index abc..def 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,4 +1,5 @@
 context
-old one
-old two
+new one
+new two
+new three
 context
`;
    const files = parseUnifiedDiff(diff);
    expect(files[0].additions).toBe(3);
    expect(files[0].deletions).toBe(2);
  });

  it("does not count file markers or hunk headers as changed lines", () => {
    const diff = `diff --git a/a.ts b/a.ts
index 111..222 100644
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-a
+A
`;
    const files = parseUnifiedDiff(diff);
    // Only the actual -a/+A lines, not `--- a/a.ts`, `+++ b/a.ts`, or `@@`.
    expect(files[0].additions).toBe(1);
    expect(files[0].deletions).toBe(1);
  });

  it("counts removed lines whose content starts with dashes", () => {
    const diff = `diff --git a/a.md b/a.md
index 111..222 100644
--- a/a.md
+++ b/a.md
@@ -1,2 +1,1 @@
 title
----
`;
    const files = parseUnifiedDiff(diff);
    // The removed line's content is `---`; it must still count as a deletion.
    expect(files[0].additions).toBe(0);
    expect(files[0].deletions).toBe(1);
  });

  it("reports zero counts for binary files", () => {
    const diff = `diff --git a/image.png b/image.png
index abc..def 100644
Binary files a/image.png and b/image.png differ
`;
    const files = parseUnifiedDiff(diff);
    expect(files[0].additions).toBe(0);
    expect(files[0].deletions).toBe(0);
  });
});

describe("shouldDeferDiff", () => {
  const withChanged = (n: number) => ({ additions: Math.ceil(n / 2), deletions: Math.floor(n / 2) });

  it("renders files through the limit", () => {
    expect(shouldDeferDiff(withChanged(0))).toBe(false);
    expect(shouldDeferDiff(withChanged(RENDER_CHANGED_LINE_LIMIT))).toBe(false);
  });

  it("defers files above the render limit", () => {
    expect(shouldDeferDiff(withChanged(RENDER_CHANGED_LINE_LIMIT + 1))).toBe(true);
    expect(shouldDeferDiff(withChanged(100_000))).toBe(true);
  });
});

describe("parseSplitDiff", () => {
  it("aligns replacement blocks and tracks line numbers", () => {
    const rows = parseSplitDiff(`diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -10,3 +10,4 @@ function x() {
 context
-old one
-old two
+new one
+new two
+new three
 tail`);

    expect(rows).toEqual([
      { kind: "hunk", text: "@@ -10,3 +10,4 @@ function x() {" },
      {
        kind: "lines",
        old: { lineNumber: 10, text: "context", kind: "context" },
        new: { lineNumber: 10, text: "context", kind: "context" },
      },
      {
        kind: "lines",
        old: { lineNumber: 11, text: "old one", kind: "deletion" },
        new: { lineNumber: 11, text: "new one", kind: "addition" },
      },
      {
        kind: "lines",
        old: { lineNumber: 12, text: "old two", kind: "deletion" },
        new: { lineNumber: 12, text: "new two", kind: "addition" },
      },
      {
        kind: "lines",
        old: { lineNumber: null, text: "", kind: "empty" },
        new: { lineNumber: 13, text: "new three", kind: "addition" },
      },
      {
        kind: "lines",
        old: { lineNumber: 13, text: "tail", kind: "context" },
        new: { lineNumber: 14, text: "tail", kind: "context" },
      },
    ]);
  });

  it("resets counters at each hunk", () => {
    const rows = parseSplitDiff(`@@ -1 +2 @@
-a
+b
@@ -20 +30 @@
 c`);
    expect(rows[rows.length - 1]).toEqual({
      kind: "lines",
      old: { lineNumber: 20, text: "c", kind: "context" },
      new: { lineNumber: 30, text: "c", kind: "context" },
    });
  });
});
