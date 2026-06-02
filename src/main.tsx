import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./App.css";
import { setDemoModeActive } from "./lib/api";
import { getDemoMode } from "./lib/settings";

// Load the demoMode setting before the first render so the dashboard's
// initial data fetch hits the right API surface. The fallback on error means
// a broken store doesn't strand the app on a blank screen — it just lands
// in normal (non-demo) mode, which is the safer default.
async function boot() {
  try {
    setDemoModeActive(await getDemoMode());
  } catch (e) {
    console.warn("could not load demoMode setting; defaulting to off", e);
  }
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
}

boot();
