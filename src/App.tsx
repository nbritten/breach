import { useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
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

function Rail() {
  const { pathname } = useLocation();
  const isRepos = pathname === "/" || pathname.startsWith("/repo/");
  const isSettings = pathname.startsWith("/settings");

  const itemBase =
    "flex items-center justify-center w-10 h-10 rounded-lg transition-colors";
  const active = "bg-neutral-800 text-neutral-100";
  const inactive = "text-neutral-500 hover:text-neutral-100 hover:bg-neutral-800/60";

  return (
    <nav className="shrink-0 w-[64px] h-full border-r border-neutral-800 bg-neutral-950 flex flex-col items-center py-3 gap-2">
      <Link
        to="/"
        title="Repositories"
        aria-label="Repositories"
        className={`${itemBase} ${isRepos ? active : inactive}`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
          <path d="M8 5v14" />
          <path d="M12 9h4" />
          <path d="M12 13h4" />
        </svg>
      </Link>

      <div className="flex-1" />

      <Link
        to="/settings"
        title="Settings"
        aria-label="Settings"
        className={`${itemBase} ${isSettings ? active : inactive}`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </Link>
    </nav>
  );
}

function OnboardingGate() {
  const { visible, show, hide } = useOnboarding();
  const [autoShow, setAutoShow] = useState(false);
  const [initialPath, setInitialPath] = useState("~/repos");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const flag = await getOnboarded();
        if (flag) {
          setAutoShow(false);
          setReady(true);
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
          setAutoShow(false);
        } else {
          setAutoShow(true);
          show();
        }
      } finally {
        setReady(true);
      }
    })();
  }, [show]);

  if (!ready || !visible) return null;

  return (
    <Onboarding
      persistOnFinish={autoShow}
      initialReposPath={initialPath}
      onDone={() => {
        setAutoShow(false);
        hide();
      }}
    />
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SearchProvider>
        <OnboardingProvider>
          <div className="h-full flex flex-col">
            <TopBar />
            <div className="flex-1 flex overflow-hidden">
              <Rail />
              <div className="flex-1 overflow-hidden">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/repo/:path" element={<RepoDetail />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </div>
            </div>
          </div>
          <OnboardingGate />
        </OnboardingProvider>
      </SearchProvider>
    </ToastProvider>
  );
}
