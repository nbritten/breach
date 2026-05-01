import { useEffect, useState } from "react";
import logo from "../assets/logo.png";
import {
  FALLBACK_DEFAULT_BRANCH,
  setOnboarded,
  setRepoOrgs,
  setReposPath,
} from "../lib/settings";
import { useOnboarding } from "../lib/onboarding";
import { api } from "../lib/api";

type Step = 0 | 1 | 2 | 3;

interface Props {
  persistOnFinish: boolean;
  initialReposPath: string;
  onDone: () => void;
}

export function Onboarding({
  persistOnFinish,
  initialReposPath,
  onDone,
}: Props) {
  const { hide } = useOnboarding();
  const [step, setStep] = useState<Step>(0);
  const [path, setPath] = useState(initialReposPath || "~/repos");
  const [orgInput, setOrgInput] = useState("");
  const [orgs, setOrgs] = useState<string[]>([]);
  const [autoAddedLogin, setAutoAddedLogin] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // When the user reaches the accounts step with no entries yet, pre-seed the list
  // with their own GitHub login so the zero-config flow shows their personal repos.
  // Failures are silent — the rest of the onboarding still works.
  useEffect(() => {
    if (step !== 2 || orgs.length > 0 || autoAddedLogin !== null) return;
    let cancelled = false;
    api
      .ghLogin()
      .then((login) => {
        if (cancelled || !login) return;
        setOrgs([login]);
        setAutoAddedLogin(login);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [step, orgs.length, autoAddedLogin]);

  const addOrg = () => {
    const v = orgInput.trim();
    if (!v) return;
    if (!orgs.includes(v)) setOrgs([...orgs, v]);
    setOrgInput("");
  };

  const finish = async () => {
    setSaving(true);
    try {
      if (persistOnFinish) {
        await setReposPath(path.trim() || "~/repos");
        if (orgs.length > 0) await setRepoOrgs(orgs);
        await setOnboarded(true);
      }
    } finally {
      setSaving(false);
      hide();
      onDone();
    }
  };

  const cancel = () => {
    hide();
    onDone();
  };

  const total = 4;

  return (
    <div className="fixed inset-0 z-[100] bg-neutral-950/95 backdrop-blur-sm flex items-center justify-center">
      <div className="w-full max-w-lg mx-6 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="h-1 bg-neutral-800">
          <div
            className="h-1 bg-sky-500 transition-all"
            style={{ width: `${((step + 1) / total) * 100}%` }}
          />
        </div>

        <div className="p-6 min-h-[340px] flex flex-col">
          {step === 0 && (
            <div className="flex-1 flex flex-col items-center text-center gap-4">
              <img
                src={logo}
                alt=""
                width={140}
                height={140}
                className="whale-float"
                style={{ imageRendering: "pixelated" }}
              />
              <h1 className="text-2xl font-semibold">Welcome to Breach</h1>
              <p className="text-sm text-neutral-400 max-w-sm">
                A multi-repo overview for your local clones. Sync, search, and keep
                dozens of repositories coherent without leaving the dashboard.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="flex-1 flex flex-col gap-4">
              <h2 className="text-lg font-semibold">Where do your repos live?</h2>
              <p className="text-sm text-neutral-400">
                Breach will scan this directory for git repos.{" "}
                <code className="text-neutral-300">~</code> expands to your home
                folder.
              </p>
              <input
                value={path}
                onChange={(e) => setPath(e.currentTarget.value)}
                className="w-full px-3 py-2 rounded bg-neutral-950 border border-neutral-800 font-mono text-sm focus:outline-none focus:border-neutral-600"
                placeholder="~/repos"
                autoFocus
              />
              <p className="text-xs text-neutral-500">
                Don't have one? That's fine — Breach will create it when you run
                Clone missing.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="flex-1 flex flex-col gap-4">
              <h2 className="text-lg font-semibold">Add your GitHub accounts</h2>
              <p className="text-sm text-neutral-400">
                Clone missing previews repos under each of these accounts (orgs or
                users) via <code>gh</code>. Optional — you can skip and add later.
              </p>
              <div className="flex gap-2">
                <input
                  value={orgInput}
                  onChange={(e) => setOrgInput(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addOrg();
                    }
                  }}
                  className="flex-1 px-3 py-2 rounded bg-neutral-950 border border-neutral-800 font-mono text-sm focus:outline-none focus:border-neutral-600"
                  placeholder="my-org or my-username"
                  autoFocus
                />
                <button
                  onClick={addOrg}
                  className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm"
                >
                  Add
                </button>
              </div>
              {orgs.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {orgs.map((o) => (
                    <span
                      key={o}
                      className="text-xs font-mono bg-neutral-800 rounded px-2 py-1 flex items-center gap-1.5"
                    >
                      {o}
                      <button
                        onClick={() => setOrgs(orgs.filter((x) => x !== o))}
                        className="text-neutral-500 hover:text-rose-300"
                        aria-label={`Remove ${o}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {autoAddedLogin && orgs.includes(autoAddedLogin) && (
                <p className="text-xs text-neutral-500">
                  Added your GitHub account from <code>gh</code>. Remove it if you'd
                  rather not include your personal repos.
                </p>
              )}
              <p className="text-xs text-neutral-500">
                Requires <code>gh</code> CLI authed. If you don't have it:{" "}
                <code>brew install gh && gh auth login</code>.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="flex-1 flex flex-col items-center text-center gap-4 pt-4">
              <img
                src={logo}
                alt=""
                width={100}
                height={100}
                className="whale-float"
                style={{ imageRendering: "pixelated" }}
              />
              <h2 className="text-lg font-semibold">You're all set</h2>
              <div className="text-sm text-neutral-400 space-y-2 max-w-sm text-left">
                <p>A few things to know:</p>
                <ul className="space-y-1.5 text-xs">
                  <li>
                    <span className="text-neutral-200">Pin</span> repos from the
                    dashboard — pinned ones float to the top.
                  </li>
                  <li>
                    <span className="text-neutral-200">Clone missing</span> in the
                    header previews repos under your configured accounts so you can
                    pick what to clone.
                  </li>
                  <li>
                    <span className="text-neutral-200">⌘K</span> focuses search
                    anywhere.
                  </li>
                  <li>
                    <span className="text-neutral-200">Default branch</span>:{" "}
                    {FALLBACK_DEFAULT_BRANCH}. Override per-repo in Settings.
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-between">
          <button
            onClick={cancel}
            className="text-xs text-neutral-500 hover:text-neutral-300"
          >
            Skip setup
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => (s - 1) as Step)}
                className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm"
                disabled={saving}
              >
                Back
              </button>
            )}
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => (s + 1) as Step)}
                className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium"
              >
                {step === 0 ? "Get started" : "Next"}
              </button>
            ) : (
              <button
                onClick={finish}
                disabled={saving}
                className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium disabled:opacity-60"
              >
                {saving ? "Saving…" : persistOnFinish ? "Finish" : "Close"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
