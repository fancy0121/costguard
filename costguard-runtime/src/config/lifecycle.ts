import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { restoreCatalog, type CatalogOperationResult } from "../codex/catalog";
import { isOwnedJson } from "./homes";

async function uninstallCodexProjection(codexHome: string): Promise<UninstallResult> {
  const projection = join(codexHome, "opencodex-catalog.json");
  try {
    await readFile(projection, "utf8");
  } catch {
    return { status: "MISSING", reason: "no-owned-state" };
  }
  if (!(await isOwnedJson(projection))) return { status: "UNKNOWN", reason: "owned-state-unverified" };
  await unlink(projection);
  await unlink(`${projection}.owner`).catch(() => undefined);
  await unlink(`${projection}.owner.sha256`).catch(() => undefined);
  return { status: "PRESENT", removed: 1 };
}

export async function restoreOwnedStateWithCodexProjection(costGuardHome: string, codexHome: string): Promise<CatalogOperationResult> {
  const projection = join(codexHome, "opencodex-catalog.json");
  try {
    await readFile(projection, "utf8");
  } catch {
    const catalog = await restoreOwnedState(costGuardHome);
    return catalog.status === "MISSING" ? { status: "MISSING", reason: "no-owned-state" } : catalog;
  }
  if (!(await isOwnedJson(projection))) return { status: "UNKNOWN", reason: "owned-state-unverified" };
  await unlink(projection);
  await unlink(`${projection}.owner`).catch(() => undefined);
  await unlink(`${projection}.owner.sha256`).catch(() => undefined);
  return { status: "PRESENT" };
}

export type UninstallResult =
  | { status: "PRESENT"; removed: number }
  | { status: "MISSING"; reason: "no-owned-state" }
  | { status: "UNKNOWN"; reason: "owned-state-scan-failed" | "owned-state-unverified" };

export async function restoreOwnedState(home: string): Promise<CatalogOperationResult> {
  return restoreCatalog(home, "default");
}

export async function uninstallOwnedState(home: string): Promise<UninstallResult> {
  let removed = 0;
  let blocked = false;

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (!entry.name.endsWith(".owner")) continue;
      if ((await readFile(path, "utf8")) !== "costguard\n") continue;
      const ownedPath = path.slice(0, -".owner".length);
      if (!(await isOwnedJson(ownedPath))) {
        blocked = true;
        continue;
      }
      try {
        await unlink(ownedPath);
      } catch {
        // An owner marker without its target is safe to remove.
      }
      await unlink(path);
      await unlink(`${ownedPath}.owner.sha256`).catch(() => undefined);
      removed += 1;
    }
  }

  try {
    await walk(home);
  } catch {
    return { status: "UNKNOWN", reason: "owned-state-scan-failed" };
  }
  if (blocked) return { status: "UNKNOWN", reason: "owned-state-unverified" };
  return removed === 0 ? { status: "MISSING", reason: "no-owned-state" } : { status: "PRESENT", removed };
}

export async function uninstallOwnedStateWithCodexProjection(costGuardHome: string, codexHome: string): Promise<UninstallResult> {
  const local = await uninstallOwnedState(costGuardHome);
  const projection = await uninstallCodexProjection(codexHome);
  if (local.status === "UNKNOWN" || projection.status === "UNKNOWN") return { status: "UNKNOWN", reason: "owned-state-unverified" };
  const removed = (local.status === "PRESENT" ? local.removed : 0) + (projection.status === "PRESENT" ? projection.removed : 0);
  return removed > 0 ? { status: "PRESENT", removed } : { status: "MISSING", reason: "no-owned-state" };
}
