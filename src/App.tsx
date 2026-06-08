import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { RepoDetail } from "./pages/RepoDetail";
import { Settings } from "./pages/Settings";
import { TopBar } from "./components/TopBar";
import { Onboarding } from "./components/Onboarding";
import { SearchProvider } from "./lib/search";
import { OnboardingProvider, useOnboarding } from "./lib/onboarding";
import { ToastProvider } from "./lib/toast";
import {
  getOnboarded,
  getPinnedRepos,
  getRepoOrgs,
  getReposPath,
  setOnboarded,
} from "./lib/settings";

type BootState = "loading" | "first-launch" | "ready";

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
      <Onboarding
        persistOnFinish
        initialReposPath={initialPath}
        onDone={() => setBootState("ready")}
      />
    );
  }

  return (
    <>
      <div className="h-full flex flex-col">
        <TopBar />
        <div className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/repo/:path" element={<RepoDetail />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </div>
      {visible && (
        <Onboarding
          persistOnFinish={false}
          initialReposPath={initialPath}
          onDone={hide}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SearchProvider>
        <OnboardingProvider>
          <AppShell />
        </OnboardingProvider>
      </SearchProvider>
    </ToastProvider>
  );
}
