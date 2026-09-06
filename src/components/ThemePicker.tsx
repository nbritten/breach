import { type CSSProperties, useRef, useState } from "react";
import { themes, themeVariables } from "../lib/themes";
import { selectTheme, useTheme } from "../lib/themeState";

export function ThemePicker() {
  const selected = useTheme();
  const [status, setStatus] = useState("");
  const request = useRef(0);
  return (
    <section aria-labelledby="appearance-title">
      <h2 id="appearance-title" className="text-sm font-medium text-neutral-100">Appearance</h2>
      <p id="theme-description" className="text-xs text-neutral-400 mt-1 mb-4">Make Breach feel like your space. Themes apply instantly and save automatically.</p>
      <fieldset aria-describedby="theme-description">
        <legend className="sr-only">Workspace theme</legend>
        <div className="theme-grid">
          {themes.map((theme) => (
            <label key={theme.id} className="theme-option">
              <input type="radio" name="workspace-theme" value={theme.id} checked={selected === theme.id}
                onChange={async () => {
                  const id = ++request.current;
                  setStatus("Saving theme…");
                  try {
                    await selectTheme(theme.id);
                    if (id === request.current) setStatus(`${theme.name} saved`);
                  } catch {
                    if (id === request.current) setStatus("Could not save your theme. Your previous theme has been restored. Try again.");
                  }
                }} />
              <span className="theme-card">
                <span className="theme-preview" style={themeVariables(theme.id) as CSSProperties} aria-hidden="true">
                  <span className="theme-preview-bar"><i /><i /><i /></span>
                  <span className="theme-preview-sidebar"><b /><b /><b /></span>
                  <span className="theme-preview-content"><b /><span><i /><i /></span><em /></span>
                </span>
                <span className="theme-caption"><span><strong>{theme.name}</strong><small>{theme.description}</small></span><span className="theme-selected" aria-hidden="true">✓</span></span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p role="status" className="text-xs text-neutral-400 mt-3 min-h-5">{status || `${themes.find((theme) => theme.id === selected)?.name} selected`}</p>
    </section>
  );
}
