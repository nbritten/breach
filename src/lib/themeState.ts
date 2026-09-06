import { useSyncExternalStore } from "react";
import { getTheme, setTheme } from "./settings";
import { DEFAULT_THEME, themeVariables, type ThemeId } from "./themes";

let current: ThemeId = DEFAULT_THEME;
let saved: ThemeId = DEFAULT_THEME;
let revision = 0;
let queue = Promise.resolve();
const listeners = new Set<() => void>();
export function applyTheme(id: ThemeId) {
  current = id;
  document.documentElement.dataset.theme = id;
  for (const [key, value] of Object.entries(themeVariables(id))) {
    document.documentElement.style.setProperty(key, value);
  }
  listeners.forEach((listener) => listener());
}
export async function loadTheme() {
  try { saved = await getTheme(); }
  catch (error) { console.warn("Could not load theme; using Graphite", error); }
  applyTheme(saved);
}
export function selectTheme(id: ThemeId): Promise<void> {
  const request = ++revision;
  applyTheme(id);
  const result = queue.then(async () => {
    try {
      await setTheme(id);
      saved = id;
    } catch (error) {
      if (request === revision) applyTheme(saved);
      throw error;
    }
  });
  queue = result.catch(() => {});
  return result;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function useTheme() {
  return useSyncExternalStore(subscribe, () => current);
}
