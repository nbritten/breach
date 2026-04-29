import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import logo from "../assets/logo.png";
import { useOnboarding } from "../lib/onboarding";
import {
  FALLBACK_DEFAULT_BRANCH,
  getBranchOverrides,
  getDefaultBranch,
  getPinnedRepos,
  getRepoOrgs,
  getReposPath,
  getServiceRepos,
  getServiceUrlTemplate,
  setBranchOverrides,
  setDefaultBranch,
  setPinnedRepos,
  setRepoOrgs,
  setReposPath,
  setServiceRepos,
  setServiceUrlTemplate,
} from "../lib/settings";
import { SettingsSection } from "../components/settings/SettingsSection";
import { RemoveButton } from "../components/settings/RemoveButton";
import { useToast } from "../lib/toast";
import {
  applyImport,
  buildExport,
  downloadExport,
  parseImport,
  pickJsonFile,
} from "../lib/settingsIo";

type Row = { id: number; name: string; branch: string };
type OrgRow = { id: number; org: string };
type PinRow = { id: number; name: string };
type ServiceRow = { id: number; name: string };

let rowId = 0;
const newRow = (name = "", branch = ""): Row => ({ id: rowId++, name, branch });
const newOrgRow = (org = ""): OrgRow => ({ id: rowId++, org });
const newPinRow = (name = ""): PinRow => ({ id: rowId++, name });
const newServiceRow = (name = ""): ServiceRow => ({ id: rowId++, name });

const INPUT_CLS =
  "px-3 py-1.5 rounded bg-neutral-900 border border-neutral-800 font-mono text-sm focus:outline-none focus:border-neutral-600";

export function Settings() {
  const [path, setPath] = useState("");
  const [fallback, setFallback] = useState(FALLBACK_DEFAULT_BRANCH);
  const [rows, setRows] = useState<Row[]>([]);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [pins, setPins] = useState<PinRow[]>([]);
  const [serviceTpl, setServiceTpl] = useState("");
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [saved, setSaved] = useState(false);
  const [imported, setImported] = useState(false);
  const { show: showOnboarding } = useOnboarding();
  const { showError } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [p, f, overrides, orgList, pinList, tpl, serviceList] =
          await Promise.all([
            getReposPath(),
            getDefaultBranch(),
            getBranchOverrides(),
            getRepoOrgs(),
            getPinnedRepos(),
            getServiceUrlTemplate(),
            getServiceRepos(),
          ]);
        setPath(p);
        setFallback(f);
        const entries = Object.entries(overrides);
        setRows(entries.length ? entries.map(([n, b]) => newRow(n, b)) : []);
        setOrgs(orgList.map((o) => newOrgRow(o)));
        setPins(pinList.map((n) => newPinRow(n)));
        setServiceTpl(tpl);
        setServices(serviceList.map((n) => newServiceRow(n)));
      } catch (e) {
        showError(e);
      }
    })();
  }, [showError]);

  const save = async () => {
    const map: Record<string, string> = {};
    for (const r of rows) {
      const name = r.name.trim();
      const branch = r.branch.trim();
      if (name && branch) map[name] = branch;
    }
    const orgList = orgs.map((o) => o.org.trim()).filter((s) => s.length > 0);
    const pinList = pins.map((p) => p.name.trim()).filter((s) => s.length > 0);
    const serviceList = services
      .map((s) => s.name.trim())
      .filter((s) => s.length > 0);
    try {
      await Promise.all([
        setReposPath(path.trim()),
        setDefaultBranch(fallback.trim() || FALLBACK_DEFAULT_BRANCH),
        setBranchOverrides(map),
        setRepoOrgs(orgList),
        setPinnedRepos(pinList),
        setServiceUrlTemplate(serviceTpl.trim()),
        setServiceRepos(serviceList),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      showError(e);
    }
  };

  const updateRow = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: number) => setRows((rs) => rs.filter((r) => r.id !== id));
  const addRow = () => setRows((rs) => [...rs, newRow()]);

  const updateOrgRow = (id: number, org: string) =>
    setOrgs((os) => os.map((o) => (o.id === id ? { ...o, org } : o)));
  const removeOrgRow = (id: number) =>
    setOrgs((os) => os.filter((o) => o.id !== id));
  const addOrgRow = () => setOrgs((os) => [...os, newOrgRow()]);

  const updateServiceRow = (id: number, name: string) =>
    setServices((ss) => ss.map((s) => (s.id === id ? { ...s, name } : s)));
  const removeServiceRow = (id: number) =>
    setServices((ss) => ss.filter((s) => s.id !== id));
  const addServiceRow = () => setServices((ss) => [...ss, newServiceRow()]);

  const updatePinRow = (id: number, name: string) =>
    setPins((ps) => ps.map((p) => (p.id === id ? { ...p, name } : p)));
  const removePinRow = (id: number) =>
    setPins((ps) => ps.filter((p) => p.id !== id));
  const addPinRow = () => setPins((ps) => [...ps, newPinRow()]);

  const onExport = async () => {
    try {
      // Save first so the export reflects whatever the user has typed but not yet saved.
      await save();
      const payload = await buildExport();
      downloadExport(payload);
    } catch (e) {
      showError(e);
    }
  };

  const onImport = async () => {
    try {
      const file = await pickJsonFile();
      if (!file) return;
      const text = await file.text();
      const payload = parseImport(text);
      await applyImport(payload);
      // Reload visible state from store so the form reflects what was just imported.
      const [p, f, overrides, orgList, pinList, tpl, serviceList] =
        await Promise.all([
          getReposPath(),
          getDefaultBranch(),
          getBranchOverrides(),
          getRepoOrgs(),
          getPinnedRepos(),
          getServiceUrlTemplate(),
          getServiceRepos(),
        ]);
      setPath(p);
      setFallback(f);
      const entries = Object.entries(overrides);
      setRows(entries.length ? entries.map(([n, b]) => newRow(n, b)) : []);
      setOrgs(orgList.map((o) => newOrgRow(o)));
      setPins(pinList.map((n) => newPinRow(n)));
      setServiceTpl(tpl);
      setServices(serviceList.map((n) => newServiceRow(n)));
      setImported(true);
      setTimeout(() => setImported(false), 1500);
    } catch (e) {
      showError(e);
    }
  };

  return (
    <div className="flex flex-col h-full relative">
      <img
        src={logo}
        alt=""
        width={360}
        height={360}
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 opacity-[0.04]"
        style={{ imageRendering: "pixelated" }}
        draggable={false}
      />
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center gap-4 relative z-10">
        <Link to="/" className="text-sm text-neutral-400 hover:text-neutral-100">
          ← Back
        </Link>
        <h1 className="text-lg font-semibold">Settings</h1>
      </header>

      <main className="p-6 max-w-2xl overflow-auto relative z-10">
        <section className="mb-8">
          <label className="block text-sm font-medium mb-1">Repos path</label>
          <p className="text-xs text-neutral-500 mb-2">
            Directory scanned for git repositories. <code>~</code> expands to your home dir.
          </p>
          <input
            value={path}
            onChange={(e) => setPath(e.currentTarget.value)}
            className={`w-full py-2 ${INPUT_CLS}`}
            placeholder="~/repos"
          />
        </section>

        <section className="mb-8">
          <label className="block text-sm font-medium mb-1">Default branch</label>
          <p className="text-xs text-neutral-500 mb-2">
            Branch used by Sync when a repo has no override below.
          </p>
          <input
            value={fallback}
            onChange={(e) => setFallback(e.currentTarget.value)}
            className={`w-64 py-2 ${INPUT_CLS}`}
            placeholder="main"
          />
        </section>

        <SettingsSection
          label="Branch overrides"
          description="Per-repo branch used instead of the default when syncing. Repo name matches the directory name under your repos path."
          onAdd={addRow}
          itemCount={rows.length}
          emptyLabel={
            <>
              No overrides. Click <span className="font-mono">+ Add</span> to create one.
            </>
          }
        >
          {rows.length > 0 && (
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs uppercase tracking-wide text-neutral-500 px-1">
              <div>Repo name</div>
              <div>Branch</div>
              <div />
            </div>
          )}
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center"
            >
              <input
                value={r.name}
                onChange={(e) => updateRow(r.id, { name: e.currentTarget.value })}
                placeholder="my-repo"
                className={INPUT_CLS}
              />
              <input
                value={r.branch}
                onChange={(e) => updateRow(r.id, { branch: e.currentTarget.value })}
                placeholder="beta"
                className={INPUT_CLS}
              />
              <RemoveButton onClick={() => removeRow(r.id)} label="Remove override" />
            </div>
          ))}
        </SettingsSection>

        <SettingsSection
          label="Pinned repos"
          description="Local repo names to pin at the top of the dashboard, above team sections."
          onAdd={addPinRow}
          itemCount={pins.length}
          emptyLabel="No pinned repos. Click + Add to pin one."
        >
          {pins.map((p) => (
            <div key={p.id} className="grid grid-cols-[1fr_auto] gap-2 items-center">
              <input
                value={p.name}
                onChange={(e) => updatePinRow(p.id, e.currentTarget.value)}
                placeholder="my-repo"
                className={INPUT_CLS}
              />
              <RemoveButton onClick={() => removePinRow(p.id)} label="Remove pin" />
            </div>
          ))}
        </SettingsSection>

        <SettingsSection
          label="Service docs"
          description={
            <>
              Repos that expose a docs page. Each listed repo gets a "Docs" button on its
              card that opens the URL with{" "}
              <code className="text-neutral-300">{"{name}"}</code> replaced by the repo's
              directory name.
            </>
          }
          onAdd={addServiceRow}
          itemCount={services.length}
          emptyLabel="No services. Click + Add to add one."
        >
          <input
            value={serviceTpl}
            onChange={(e) => setServiceTpl(e.currentTarget.value)}
            placeholder="https://{name}.example.com/docs"
            className={`w-full mb-1 ${INPUT_CLS}`}
          />
          {services.map((s) => (
            <div key={s.id} className="grid grid-cols-[1fr_auto] gap-2 items-center">
              <input
                value={s.name}
                onChange={(e) => updateServiceRow(s.id, e.currentTarget.value)}
                placeholder="my-service"
                className={INPUT_CLS}
              />
              <RemoveButton onClick={() => removeServiceRow(s.id)} label="Remove service" />
            </div>
          ))}
        </SettingsSection>

        <SettingsSection
          label="GitHub orgs"
          description={
            <>
              Clone missing walks repos in these orgs and clones any pinned repos that
              aren't local yet. If no pins are set, it clones every non-archived repo.
              Requires <code>gh</code> CLI authed.
            </>
          }
          onAdd={addOrgRow}
          itemCount={orgs.length}
          emptyLabel="No orgs configured. Click + Add to create one."
        >
          {orgs.map((o) => (
            <div key={o.id} className="grid grid-cols-[1fr_auto] gap-2 items-center">
              <input
                value={o.org}
                onChange={(e) => updateOrgRow(o.id, e.currentTarget.value)}
                placeholder="my-org"
                className={INPUT_CLS}
              />
              <RemoveButton onClick={() => removeOrgRow(o.id)} label="Remove org" />
            </div>
          ))}
        </SettingsSection>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm"
          >
            Save
          </button>
          {saved && <span className="text-xs text-emerald-400">Saved</span>}
          {imported && <span className="text-xs text-emerald-400">Imported</span>}
          <button
            onClick={onExport}
            className="ml-auto px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm"
          >
            Export
          </button>
          <button
            onClick={onImport}
            className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm"
          >
            Import
          </button>
          <button
            onClick={showOnboarding}
            className="text-xs text-neutral-500 hover:text-neutral-300 underline underline-offset-2"
          >
            Re-open welcome wizard
          </button>
        </div>
      </main>
    </div>
  );
}
