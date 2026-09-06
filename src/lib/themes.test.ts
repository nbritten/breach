import { describe, expect, it } from "vitest";
import { resolveTheme, themes, themeVariables } from "./themes";

function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)!.map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}

describe("curated palettes", () => {
  it("safely resolves missing or unknown stored preferences", () => {
    for (const value of [undefined, null, "unknown", {}, 2]) expect(resolveTheme(value)).toBe("graphite");
    expect(resolveTheme("lagoon")).toBe("lagoon");
  });
  for (const theme of themes) {
    it(`${theme.name} keeps body text, muted labels, and primary buttons readable`, () => {
      const colors = themeVariables(theme.id);
      for (const background of ["--color-neutral-950", "--color-neutral-900", "--surface-shell"]) {
        for (const foreground of ["--color-neutral-100", "--color-neutral-400", "--color-neutral-500", "--accent"]) {
          expect(contrast(colors[background], colors[foreground])).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrast(colors["--accent"], colors["--color-neutral-950"])).toBeGreaterThanOrEqual(4.5);
    });
  }
});
