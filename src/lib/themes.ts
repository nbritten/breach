export const themes = [
  { id: "graphite", name: "Graphite", description: "Quiet and focused", hue: 220, saturation: 12, accent: "#bac8e8" },
  { id: "plum", name: "Plum", description: "A little after hours", hue: 285, saturation: 25, accent: "#e4b4ed" },
  { id: "ocean", name: "Ocean", description: "Room to think", hue: 218, saturation: 30, accent: "#a3caff" },
  { id: "lagoon", name: "Lagoon", description: "A fresh perspective", hue: 180, saturation: 26, accent: "#8eddd0" },
  { id: "forest", name: "Forest", description: "Find your clearing", hue: 145, saturation: 20, accent: "#b8d99a" },
  { id: "terracotta", name: "Terracotta", description: "A warmer workspace", hue: 20, saturation: 25, accent: "#f0b797" },
  { id: "rose", name: "Rose", description: "Make yourself at home", hue: 335, saturation: 23, accent: "#efb0cb" },
  { id: "iris", name: "Iris", description: "A spark of possibility", hue: 250, saturation: 27, accent: "#c5bcff" },
] as const;
export type ThemeId = typeof themes[number]["id"];
export const DEFAULT_THEME: ThemeId = "graphite";
export function isThemeId(value: unknown): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}
export function resolveTheme(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME;
}
export function themeVariables(id: ThemeId): Record<string, string> {
  const theme = themes.find((entry) => entry.id === id)!;
  const shade = (lightness: number) => {
    const light = lightness / 100;
    const amplitude = theme.saturation / 100 * Math.min(light, 1 - light);
    const channel = (offset: number) => {
      const k = (offset + theme.hue / 30) % 12;
      return Math.round(255 * (light - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
        .toString(16).padStart(2, "0");
    };
    return `#${channel(0)}${channel(8)}${channel(4)}`;
  };
  return {
    ...Object.fromEntries([[950, 7.5], [900, 11], [800, 18], [700, 27], [600, 44], [500, 63], [400, 72], [300, 81], [200, 88], [100, 95]].map(([step, lightness]) => [`--color-neutral-${step}`, shade(lightness)])),
    "--surface-shell": shade(9.5),
    "--surface-hover": shade(15),
    "--line": shade(18),
    "--accent": theme.accent,
    "--color-breach-pink": theme.accent,
  };
}
