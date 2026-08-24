import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectCatalogToCodexHome, type CatalogSnapshot } from "../src/codex/catalog";

const providers = { fixture: ["model-a", "model-sub", "model-other"] };

function snapshot(overrides: Partial<CatalogSnapshot> = {}): CatalogSnapshot {
  return {
    version: 1,
    selectedModels: ["fixture/model-a"],
    subagentModels: ["fixture/model-sub"],
    combos: [],
    ...overrides,
  };
}

async function projected(codexHome: string, value: CatalogSnapshot, providerMap = providers) {
  const result = await projectCatalogToCodexHome(codexHome, value, providerMap);
  expect(result.status).toBe("PRESENT");
  if (result.status !== "PRESENT") throw new Error("unreachable");
  return JSON.parse(await readFile(result.path, "utf8")) as {
    version: number;
    models: Array<{ id: string; provider: string; selected: boolean; subagent: boolean; injection: boolean }>;
  };
}

test("subagent-only route is projected with subagent true and selected false", async () => {
  const codexHome = await mkdtemp(join(tmpdir(), "savetoken-subagent-"));
  const value = await projected(codexHome, snapshot());
  const model = value.models.find((m) => m.id === "fixture/model-sub");
  expect(model).toMatchObject({ id: "fixture/model-sub", provider: "fixture", subagent: true, selected: false, injection: false });
  const selected = value.models.find((m) => m.id === "fixture/model-a");
  expect(selected).toMatchObject({ selected: true, subagent: false });
});

test("subagent model must be a configured route and fails closed otherwise", async () => {
  const codexHome = await mkdtemp(join(tmpdir(), "savetoken-subagent-"));
  const result = await projectCatalogToCodexHome(codexHome, snapshot({ subagentModels: ["fixture/unconfigured"] }), providers);
  expect(result).toEqual({ status: "UNKNOWN", reason: "catalog-projection-route-unverified" });
});

test("duplicate subagent models are rejected before write", async () => {
  const codexHome = await mkdtemp(join(tmpdir(), "savetoken-subagent-"));
  const result = await projectCatalogToCodexHome(codexHome, snapshot({ subagentModels: ["fixture/model-sub", "fixture/model-sub"] }), providers);
  expect(result).toEqual({ status: "UNKNOWN", reason: "catalog-projection-format-invalid" });
});

test("non-string subagent entries are rejected before write", async () => {
  const codexHome = await mkdtemp(join(tmpdir(), "savetoken-subagent-"));
  const result = await projectCatalogToCodexHome(
    codexHome,
    { ...snapshot(), subagentModels: ["fixture/model-sub", 42 as unknown as string] },
    providers,
  );
  expect(result).toEqual({ status: "UNKNOWN", reason: "catalog-projection-format-invalid" });
});

test("subagent projection never invents a route not present in the provider map", async () => {
  const codexHome = await mkdtemp(join(tmpdir(), "savetoken-subagent-"));
  const value = await projected(codexHome, snapshot());
  const ids = value.models.map((m) => m.id).sort();
  expect(ids).toEqual(["fixture/model-a", "fixture/model-other", "fixture/model-sub"]);
});
