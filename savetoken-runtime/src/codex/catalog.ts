import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteOwnedJson, isOwnedJson } from "../config/homes";
import type { SaveTokenTier } from "../types";

export type CatalogEffort = "low" | "medium" | "high";

export type CatalogCombo = {
  id: string;
  routes: string[];
  tier: SaveTokenTier;
  aliases?: string[];
  strategy?: "failover" | "round-robin";
};

export type CatalogSnapshot = {
  version: 1;
  selectedModels: string[];
  subagentModels: string[];
  injectionModel?: string;
  injectionEffort?: CatalogEffort;
  combos: CatalogCombo[];
};

export type CatalogOperationResult =
  | { status: "PRESENT" }
  | { status: "MISSING"; reason: string }
  | { status: "UNKNOWN"; reason: string };

export type CatalogProjectionResult =
  | { status: "PRESENT"; path: string }
  | { status: "UNKNOWN"; reason: string };

function catalogPath(home: string, id: string): string {
  return join(home, "catalogs", `${id}.json`);
}

function backupPath(home: string, id: string): string {
  return join(home, "catalogs", `${id}.backup.json`);
}

function validCatalogId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id);
}

export async function writeCatalog(home: string, id: string, snapshot: CatalogSnapshot): Promise<void> {
  if (!validCatalogId(id)) throw new Error("catalog-id-invalid");
  await atomicWriteOwnedJson(catalogPath(home, id), snapshot);
}

export async function backupCatalog(home: string, id: string): Promise<CatalogOperationResult> {
  if (!validCatalogId(id)) return { status: "UNKNOWN", reason: "catalog-id-invalid" };
  const source = catalogPath(home, id);
  try {
    if (!(await isOwnedJson(source))) {
      const raw = await readFile(source, "utf8").catch(() => undefined);
      return raw === undefined ? { status: "MISSING", reason: "catalog-not-found" } : { status: "UNKNOWN", reason: "catalog-not-owned" };
    }
    const value = JSON.parse(await readFile(source, "utf8")) as CatalogSnapshot;
    await atomicWriteOwnedJson(backupPath(home, id), value);
    return { status: "PRESENT" };
  } catch {
    return { status: "MISSING", reason: "catalog-not-found" };
  }
}

export async function restoreCatalog(home: string, id: string): Promise<CatalogOperationResult> {
  if (!validCatalogId(id)) return { status: "UNKNOWN", reason: "catalog-id-invalid" };
  const source = backupPath(home, id);
  try {
    const raw = await readFile(source, "utf8");
    if (!(await isOwnedJson(source))) return { status: "UNKNOWN", reason: "backup-catalog-not-owned" };
    const value = JSON.parse(raw) as CatalogSnapshot;
    const target = catalogPath(home, id);
    try {
      await readFile(target, "utf8");
      if (!(await isOwnedJson(target))) return { status: "UNKNOWN", reason: "target-catalog-not-owned" };
    } catch {
      // A missing target is safe to create under SaveToken ownership.
    }
    await atomicWriteOwnedJson(target, value);
    return { status: "PRESENT" };
  } catch {
    return { status: "MISSING", reason: "catalog-backup-not-found" };
  }
}

/** Project the explicit SaveToken catalog into a caller-selected isolated CODEX_HOME. */
export async function projectCatalogToCodexHome(
  codexHome: string,
  snapshot: CatalogSnapshot,
  providers: Record<string, string[]>,
): Promise<CatalogProjectionResult> {
  const selected = new Set(snapshot.selectedModels);
  const subagents = new Set(snapshot.subagentModels);
  const target = join(codexHome, "opencodex-catalog.json");
  const configuredRoutes = new Set(Object.entries(providers).flatMap(([provider, models]) => models.map((model) => `${provider}/${model}`)));
  if (snapshot.version !== 1
    || ![...snapshot.selectedModels, ...snapshot.subagentModels].every((route) => typeof route === "string")
    || new Set(snapshot.selectedModels).size !== snapshot.selectedModels.length
    || new Set(snapshot.subagentModels).size !== snapshot.subagentModels.length
    || (snapshot.injectionEffort !== undefined && !["low", "medium", "high"].includes(snapshot.injectionEffort))) {
    return { status: "UNKNOWN", reason: "catalog-projection-format-invalid" };
  }
  if (snapshot.combos.some((combo) => combo.tier !== "execution"
    || (combo.strategy !== undefined && combo.strategy !== "failover" && combo.strategy !== "round-robin")
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(combo.id)
    || combo.routes.length === 0
    || new Set(combo.routes).size !== combo.routes.length
    || (combo.aliases ?? []).some((alias) => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(alias)))) {
    return { status: "UNKNOWN", reason: "catalog-projection-combo-unverified" };
  }
  if (snapshot.selectedModels.some((route) => !configuredRoutes.has(route))
    || snapshot.subagentModels.some((route) => !configuredRoutes.has(route))
    || (snapshot.injectionModel !== undefined && !configuredRoutes.has(snapshot.injectionModel))
    || snapshot.combos.some((combo) => combo.routes.length === 0 || combo.routes.some((route) => !configuredRoutes.has(route)))) {
    return { status: "UNKNOWN", reason: "catalog-projection-route-unverified" };
  }
  const models = Object.entries(providers).flatMap(([provider, providerModels]) => providerModels.map((model) => {
    const id = `${provider}/${model}`;
    return {
      id,
      provider,
      selected: selected.has(id),
      subagent: subagents.has(id),
      injection: snapshot.injectionModel === id,
      ...(snapshot.injectionModel === id && snapshot.injectionEffort ? { injectionEffort: snapshot.injectionEffort } : {}),
    };
  }));
  try {
    await atomicWriteOwnedJson(target, { version: 1, models, combos: snapshot.combos });
    return { status: "PRESENT", path: target };
  } catch (error) {
    return { status: "UNKNOWN", reason: error instanceof Error ? error.message : "catalog-projection-failed" };
  }
}
