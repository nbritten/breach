import { describe, expect, it } from "vitest";
import { parseImport, SETTINGS_VERSION, isPortableFsPath, type SettingsExport } from "./settingsIo";

const validPayload: SettingsExport = {
  version: SETTINGS_VERSION,
  settings: {
    reposPath: "~/repos",
    defaultBranch: "main",
    branchOverrides: { foo: "develop" },
    repoOrgs: ["acme"],
    pinnedRepos: ["foo"],
    serviceUrlTemplate: "https://{name}.example.com",
    serviceRepos: ["foo"],
    terminalApp: "Ghostty",
    checkForUpdates: true,
    scanNestedRepos: false,
    groupNestedRepos: true,
    theme: "graphite",
  },
};

describe("parseImport", () => {
  it("imports older files with the default theme", () => {
    const { theme: _theme, ...settings } = validPayload.settings;
    expect(parseImport(JSON.stringify({ ...validPayload, settings })).settings.theme).toBe("graphite");
  });

  it("round-trips theme choices and rejects unknown themes", () => {
    const payload = { ...validPayload, settings: { ...validPayload.settings, theme: "plum" } };
    expect(parseImport(JSON.stringify(payload)).settings.theme).toBe("plum");
    payload.settings.theme = "missing";
    expect(() => parseImport(JSON.stringify(payload))).toThrow(/theme/);
  });

  it("accepts a well-formed payload", () => {
    const parsed = parseImport(JSON.stringify(validPayload));
    expect(parsed).toEqual(validPayload);
  });

  it("rejects non-JSON text", () => {
    expect(() => parseImport("not json")).toThrow(/JSON/);
  });

  it("rejects a non-object top level", () => {
    expect(() => parseImport(JSON.stringify(["array"]))).toThrow(/object/);
    expect(() => parseImport(JSON.stringify("string"))).toThrow(/object/);
  });

  it("rejects a missing version", () => {
    const { version: _v, ...rest } = validPayload;
    expect(() => parseImport(JSON.stringify(rest))).toThrow(/version/);
  });

  it("rejects an unknown version", () => {
    const bad = { ...validPayload, version: 999 };
    expect(() => parseImport(JSON.stringify(bad))).toThrow(/Unsupported settings version/);
  });

  it("rejects missing settings object", () => {
    expect(() => parseImport(JSON.stringify({ version: SETTINGS_VERSION }))).toThrow(
      /settings/,
    );
  });

  it("rejects wrong field types", () => {
    const bad = {
      ...validPayload,
      settings: { ...validPayload.settings, repoOrgs: "acme" },
    };
    expect(() => parseImport(JSON.stringify(bad))).toThrow(/repoOrgs/);
  });

  it("rejects branchOverrides with non-string values", () => {
    const bad = {
      ...validPayload,
      settings: { ...validPayload.settings, branchOverrides: { foo: 7 } },
    };
    expect(() => parseImport(JSON.stringify(bad))).toThrow(/branchOverrides/);
  });

  it("treats a missing terminalApp as empty (older exports stay importable)", () => {
    const { terminalApp: _t, ...withoutTerminal } = validPayload.settings;
    const old = { ...validPayload, settings: withoutTerminal };
    const parsed = parseImport(JSON.stringify(old));
    expect(parsed.settings.terminalApp).toBe("");
  });

  it("rejects a non-string terminalApp", () => {
    const bad = {
      ...validPayload,
      settings: { ...validPayload.settings, terminalApp: 42 },
    };
    expect(() => parseImport(JSON.stringify(bad))).toThrow(/terminalApp/);
  });

  it("treats a missing checkForUpdates as true (older exports stay importable)", () => {
    const { checkForUpdates: _c, ...withoutFlag } = validPayload.settings;
    const old = { ...validPayload, settings: withoutFlag };
    const parsed = parseImport(JSON.stringify(old));
    expect(parsed.settings.checkForUpdates).toBe(true);
  });

  it("rejects a non-boolean checkForUpdates", () => {
    const bad = {
      ...validPayload,
      settings: { ...validPayload.settings, checkForUpdates: "yes" },
    };
    expect(() => parseImport(JSON.stringify(bad))).toThrow(/checkForUpdates/);
  });

  it("treats a missing scanNestedRepos as false (older exports stay importable)", () => {
    const { scanNestedRepos: _s, ...withoutFlag } = validPayload.settings;
    const old = { ...validPayload, settings: withoutFlag };
    const parsed = parseImport(JSON.stringify(old));
    expect(parsed.settings.scanNestedRepos).toBe(false);
  });

  it("accepts scanNestedRepos true", () => {
    const payload = {
      ...validPayload,
      settings: { ...validPayload.settings, scanNestedRepos: true },
    };
    const parsed = parseImport(JSON.stringify(payload));
    expect(parsed.settings.scanNestedRepos).toBe(true);
  });

  it("rejects a non-boolean scanNestedRepos", () => {
    const bad = {
      ...validPayload,
      settings: { ...validPayload.settings, scanNestedRepos: "yes" },
    };
    expect(() => parseImport(JSON.stringify(bad))).toThrow(/scanNestedRepos/);
  });

  it("treats a missing groupNestedRepos as true (nested grouping defaults on)", () => {
    const { groupNestedRepos: _g, ...withoutFlag } = validPayload.settings;
    const old = { ...validPayload, settings: withoutFlag };
    const parsed = parseImport(JSON.stringify(old));
    expect(parsed.settings.groupNestedRepos).toBe(true);
  });

  it("accepts groupNestedRepos false", () => {
    const payload = {
      ...validPayload,
      settings: { ...validPayload.settings, groupNestedRepos: false },
    };
    const parsed = parseImport(JSON.stringify(payload));
    expect(parsed.settings.groupNestedRepos).toBe(false);
  });

  it("rejects a non-boolean groupNestedRepos", () => {
    const bad = {
      ...validPayload,
      settings: { ...validPayload.settings, groupNestedRepos: "yes" },
    };
    expect(() => parseImport(JSON.stringify(bad))).toThrow(/groupNestedRepos/);
  });
});

describe("isPortableFsPath", () => {
  it("treats home-relative and absolute keys as filesystem paths", () => {
    expect(isPortableFsPath("~/dev/acme/frontend")).toBe(true);
    expect(isPortableFsPath("/Users/me/dev/acme/frontend")).toBe(true);
  });

  it("leaves basename pins alone", () => {
    expect(isPortableFsPath("frontend")).toBe(false);
    expect(isPortableFsPath("acme-frontend")).toBe(false);
  });
});
