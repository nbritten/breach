import { describe, expect, it } from "vitest";
import { parseImport, SETTINGS_VERSION, type SettingsExport } from "./settingsIo";

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
  },
};

describe("parseImport", () => {
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
});
