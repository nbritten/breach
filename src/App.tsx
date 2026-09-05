import { lazy, Suspense, useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { SearchProvider } from "./lib/search";
import { OnboardingProvider, useOnboarding } from "./lib/onboarding";
import { ToastProvider } from "./lib/toast";
import { TerminalSessionProvider } from "./lib/terminalSession";
import {
  getOnboarded,
  getPinnedRepos,
  getRepoOrgs,
  getReposPath,
  setOnboarded,
} from "./lib/settings";

type BootState = "loading" | "first-launch" | "ready";

const RepoDetail = lazy(() =>
  import("./pages/RepoDetail").then((module) => ({ default: module.RepoDetail })),
);
const Settings = lazy(() =>
  import("./pages/Settings").then((module) => ({ default: module.Settings })),
);
const Terminal = lazy(() =>
  import("./pages/Terminal").then((module) => ({ default: module.Terminal })),
);
const Onboarding = lazy(() =>
  import("./components/Onboarding").then((module) => ({
    default: module.Onboarding,
  })),
);

function AppShell() {
  const { visible, hide } = useOnboarding();
  const [bootState, setBootState] = useState<BootState>("loading");
  const [initialPath, setInitialPath] = useState("~/repos");

  useEffect(() => {
    (async () => {
      const flag = await getOnboarded();
      if (flag) {
        setBootState("ready");
        return;
      }
      const [path, orgs, pins] = await Promise.all([
        getReposPath(),
        getRepoOrgs(),
        getPinnedRepos(),
      ]);
      setInitialPath(path);
      if (orgs.length > 0 || pins.length > 0) {
        // Existing user predating the onboarding flag — silently mark as done.
        await setOnboarded(true);
        setBootState("ready");
      } else {
        setBootState("first-launch");
      }
    })();
  }, []);

  if (bootState === "loading") return null;

  // First launch: don't mount the dashboard at all. Otherwise list_repos,
  // the watcher, and PR fetches all fire against the unconfigured default
  // path and surface as a red error toast behind the wizard.
  if (bootState === "first-launch") {
    return (
      <Suspense fallback={null}>
        <Onboarding
          persistOnFinish
          initialReposPath={initialPath}
          onDone={() => setBootState("ready")}
        />
      </Suspense>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col">
        <TopBar />
        <div className="flex-1 flex overflow-hidden">
          <Sidebar />
          <div className="flex-1 overflow-hidden">
            <Suspense
              fallback={<div className="p-6 text-sm text-neutral-500">Loading…</div>}
            >
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/repo/:path" element={<RepoDetail />} />
                <Route path="/terminal" element={<Terminal />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Suspense>
          </div>
        </div>
      </div>
      {visible && (
        <Suspense fallback={null}>
          <Onboarding
            persistOnFinish={false}
            initialReposPath={initialPath}
            onDone={hide}
          />
        </Suspense>
      )}
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SearchProvider>
        <OnboardingProvider>
          <TerminalSessionProvider>
            <AppShell />
          </TerminalSessionProvider>
        </OnboardingProvider>
      </SearchProvider>
    </ToastProvider>
  );
}
