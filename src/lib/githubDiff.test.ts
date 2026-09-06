import { expect, it } from "vitest";
import { patchLines } from "./githubDiff";
it("maps inline comments to the correct side and line across hunks", () => {
  const lines = patchLines(
    "@@ -10,3 +20,3 @@\n context\n-old\n+new\n\\ No newline at end of file\n@@ -0,0 +1,1 @@\n+added",
  );
  expect(lines[1]).toMatchObject({ old: 10, next: 20, kind: "context" });
  expect(lines[2]).toMatchObject({ old: 11, next: null, kind: "deletion" });
  expect(lines[3]).toMatchObject({ old: null, next: 21, kind: "addition" });
  expect(lines[4]).toMatchObject({ old: null, next: null, kind: "meta" });
  expect(lines[6]).toMatchObject({ old: null, next: 1, kind: "addition" });
});
it("does not offer comment locations for unknown or malformed diff lines", () => {
  expect(
    patchLines("not a patch\n+not a hunk").every(
      (line) => line.old === null && line.next === null,
    ),
  ).toBe(true);
});
