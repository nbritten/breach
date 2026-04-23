import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "./parseDiff";

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
});
