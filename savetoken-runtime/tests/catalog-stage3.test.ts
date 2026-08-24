import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupCatalog, projectCatalogToCodexHome, restoreCatalog, writeCatalog, type CatalogSnapshot } from "../src/codex/catalog";

const snapshot: CatalogSnapshot = {
  version: 1,
  selectedModels: ["fixture/model-a"],
  subagentModels: ["fixture/model-a"],
  injectionModel: "fixture/model-a",
  injectionEffort: "medium",
  combos: [{ id: "safe-fixture", routes: ["fixture/model-a"], tier: "execution" }],
};

test("catalog backup and restore are repeatable and ownership-scoped", async () => {
  const home = await mkdtemp(join(tmpdir(), "savetoken-catalog-"));
  await writeCatalog(home, "default", snapshot);
  expect(await backupCatalog(home, "default")).toEqual({ status: "PRESENT" });

  await writeCatalog(home, "default", { ...snapshot, selectedModels: ["fixture/model-b"] });
  expect(await restoreCatalog(home, "default")).toEqual({ status: "PRESENT" });
  expect(await (await import("node:fs/promises")).readFile(join(home, "catalogs", "default.json"), "utf8")).toContain("fixture/model-a");
});

test("catalog restore refuses to overwrite an unowned target", async () => {
  const home = await mkdtemp(join(tmpdir(), "savetoken-catalog-"));
  await writeCatalog(home, "default", snapshot);
  expect(await backupCatalog(home, "default")).toEqual({ status: "PRESENT" });
  await writeFile(join(home, "catalogs", "default.json.owner"), "user\n", "utf8");

  expect(await restoreCatalog(home, "default")).toEqual({
    status: "UNKNOWN",
    reason: "target-catalog-not-owned",
  });
});

test("catalog identifiers cannot escape the SaveToken home", async () => {
  const home = await mkdtemp(join(tmpdir(), "savetoken-catalog-"));
  await expect(writeCatalog(home, "../escape", snapshot)).rejects.toThrow("catalog-id-invalid");
  expect(await backupCatalog(home, "../escape")).toEqual({ status: "UNKNOWN", reason: "catalog-id-invalid" });
  expect(await restoreCatalog(home, "C:/absolute")).toEqual({ status: "UNKNOWN", reason: "catalog-id-invalid" });
});

test("catalog backup refuses to copy an unowned source", async () => {
  const home = await mkdtemp(join(tmpdir(), "savetoken-catalog-"));
  await (await import("node:fs/promises")).mkdir(join(home, "catalogs"), { recursive: true });
  await writeFile(join(home, "catalogs", "default.json"), "user\n", "utf8");
  expect(await backupCatalog(home, "default")).toEqual({ status: "UNKNOWN", reason: "catalog-not-owned" });
});

test("catalog projection writes only an ownership-scoped isolated CODEX_HOME catalog", async () => {
  const codexHome = await mkdtemp(join(tmpdir(), "savetoken-codex-home-"));
  const projection = await projectCatalogToCodexHome(codexHome, snapshot, { fixture: ["model-a", "model-b"] });

  expect(projection).toEqual({ status: "PRESENT", path: join(codexHome, "opencodex-catalog.json") });
  const value = JSON.parse(await (await import("node:fs/promises")).readFile(join(codexHome, "opencodex-catalog.json"), "utf8"));
  expect(value.models).toEqual([
    {
      id: "fixture/model-a",
      provider: "fixture",
      selected: true,
      subagent: true,
      injection: true,
      injectionEffort: "medium",
    },
    {
      id: "fixture/model-b",
      provider: "fixture",
      selected: false,
      subagent: false,
      injection: false,
    },
  ]);
  expect(value.combos).toEqual(snapshot.combos);
});

test("catalog projection preserves a bounded subagent/injection/effort selection without inventing routes", async () => {
  const codexHome = await mkdtemp(join(tmpdir(), "savetoken-catalog-conformance-"));
  const projection = await projectCatalogToCodexHome(codexHome, snapshot, { fixture: ["model-a"] });
  expect(projection.status).toBe("PRESENT");
  const value = JSON.parse(await (await import("node:fs/promises")).readFile(join(codexHome, "opencodex-catalog.json"), "utf8"));
  expect(value.models[0]).toMatchObject({ id: "fixture/model-a", selected: true, subagent: true, injection: true, injectionEffort: "medium" });
  expect(value.combos).toEqual([{ id: "safe-fixture", routes: ["fixture/model-a"], tier: "execution" }]);
});
