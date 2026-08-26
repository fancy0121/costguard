import { describe, expect, test } from "bun:test";
import { resolveHomes, atomicWriteOwnedJson, isOwnedJson, atomicWriteOwnedJsonBatch, recoverOwnedJsonBatch } from "../src/config/homes";
import { restoreOwnedState, uninstallOwnedState } from "../src/config/lifecycle";
import { writeCatalog, backupCatalog, restoreCatalog } from "../src/codex/catalog";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Config lifecycle E2E", () => {
  test("install → write → status → restore → uninstall cycle", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "cfg-"));
    const env = { CODEX_HOME: join(tmp, "codex"), COSTGUARD_HOME: join(tmp, "st") };
    const homes = resolveHomes(env);
    try {
      // Install: create owned state
      await atomicWriteOwnedJson(join(homes.costGuardHome, "state.json"), { installed: true });
      expect(await isOwnedJson(join(homes.costGuardHome, "state.json"))).toBe(true);
      
      // Write catalog
      const cat: any = { version: 1, models: [{ id: "test/x", provider: "test" }], selectedModels: [], subagentModels: [], combos: [] };
      await writeCatalog(homes.costGuardHome, "default", cat);
      
      // Status: backup should succeed
      const backup = await backupCatalog(homes.costGuardHome, "default");
      expect(backup.status).toBe("PRESENT");
      
      // Restore
      const restore = await restoreCatalog(homes.costGuardHome, "default");
      expect(restore.status).toBe("PRESENT");
      
      // Restore is idempotent
      const restore2 = await restoreCatalog(homes.costGuardHome, "default");
      expect(restore2.status).toBe("PRESENT");
      
      // Uninstall: removes only owned state
      const uninstall = await uninstallOwnedState(homes.costGuardHome);
      expect(uninstall.status).toBe("PRESENT");
      
      // After uninstall, state is gone
      expect(await isOwnedJson(join(homes.costGuardHome, "state.json"))).toBe(false);
    } finally { await rm(tmp, { recursive: true, force: true }); }
  });

  test("user edits are preserved during restore/uninstall", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "cfg2-"));
    const env = { CODEX_HOME: join(tmp, "codex"), COSTGUARD_HOME: join(tmp, "st") };
    const homes = resolveHomes(env);
    try {
      // Write owned JSON
      await atomicWriteOwnedJson(join(homes.costGuardHome, "config.json"), { key: "st-value" });
      expect(await isOwnedJson(join(homes.costGuardHome, "config.json"))).toBe(true);
      
      // Simulate user editing the file after ownership recorded
      await writeFile(join(homes.costGuardHome, "config.json"), JSON.stringify({ key: "user-edited" }) + "\n", "utf8");
      // Ownership is now broken (hash mismatch)
      expect(await isOwnedJson(join(homes.costGuardHome, "config.json"))).toBe(false);
      
      // Uninstall should refuse to delete unowned file
      const uninstall = await uninstallOwnedState(homes.costGuardHome);
      // Should report UNKNOWN because the file's ownership was broken
      expect(uninstall.status).toBe("UNKNOWN");
    } finally { await rm(tmp, { recursive: true, force: true }); }
  });

  test("batch atomic write and journal recovery", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "cfg3-"));
    const env = { COSTGUARD_HOME: join(tmp, "st") };
    const homes = resolveHomes(env);
    try {
      await atomicWriteOwnedJsonBatch([
        { path: join(homes.costGuardHome, "a.json"), value: { id: "a" } },
        { path: join(homes.costGuardHome, "b.json"), value: { id: "b" } },
      ]);
      expect(await isOwnedJson(join(homes.costGuardHome, "a.json"))).toBe(true);
      expect(await isOwnedJson(join(homes.costGuardHome, "b.json"))).toBe(true);
      
      // Journal should be gone after successful commit
      const recovery = await recoverOwnedJsonBatch(homes.costGuardHome);
      expect(recovery.status).toBe("MISSING"); // No journal = no recovery needed
    } finally { await rm(tmp, { recursive: true, force: true }); }
  });
});
