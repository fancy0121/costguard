import { describe, expect, test } from "bun:test";
import { startRuntime } from "../src/server/runtime";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TOKEN = "mgmt-token";

async function makeRuntime(codexHome: string, costGuardHome: string) {
  return startRuntime({
    env: { CODEX_HOME: codexHome, COSTGUARD_HOME: costGuardHome },
    providers: { deepseek: ["deepseek-v4-flash"] },
    providerAdapters: [{ descriptor: { id: "deepseek", models: ["deepseek-v4-flash"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] }, invoke: async () => ({ status: "PRESENT", actualRuntimeModel: "deepseek/deepseek-v4-flash" }) }],
    providerTier: "execution",
    managementToken: TOKEN,
    taskSignals: () => ({ text: "extract format classify json data convert", isBatchOrRepetitive: true, isToolOrFileExecution: true }),
  });
}

async function api(runtime: { baseUrl: string }, path: string, method = "GET"): Promise<{ status: number; body: any }> {
  const res = await fetch(runtime.baseUrl + path, { method, headers: { authorization: "Bearer " + TOKEN } });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe("Config lifecycle real entry points", () => {
  test("install → status → sync → restore → uninstall full cycle", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "cfgl-"));
    const codexHome = join(tmp, "codex");
    const costGuardHome = join(tmp, "st");
    // Preset user config
    await (await import("node:fs/promises")).mkdir(codexHome, { recursive: true });
    await writeFile(join(codexHome, "config.toml"), 'model = "user-model"\n# user line\n', "utf8");
    const runtime = await makeRuntime(codexHome, costGuardHome);
    try {
      // Install (idempotent)
      const i1 = await api(runtime, "/api/install", "POST");
      expect(i1.status).toBe(200);
      const i2 = await api(runtime, "/api/install", "POST");
      expect(i2.status).toBe(200); // idempotent

      // Status
      const st = await api(runtime, "/api/status");
      expect(st.status).toBe(200);
      expect(st.body.health.status).toBe("healthy");

      // Sync
      const sy = await api(runtime, "/api/sync", "POST");
      expect(sy.status).toBe(200);

      // Doctor
      const doc = await api(runtime, "/api/doctor");
      expect(doc.status).toBe(200);
      expect(Array.isArray(doc.body.findings)).toBe(true);

      // User config preserved
      const userConfig = await readFile(join(codexHome, "config.toml"), "utf8");
      expect(userConfig).toContain("user-model");
      expect(userConfig).toContain("# user line");

      // Restore (idempotent)
      const r1 = await api(runtime, "/api/restore", "POST");
      expect(r1.status).toBe(200);
      const r2 = await api(runtime, "/api/restore", "POST");
      expect(r2.status).toBe(404);

      // Uninstall (idempotent)
      const u1 = await api(runtime, "/api/uninstall", "POST");
      expect(u1.status).toBe(200);
      const u2 = await api(runtime, "/api/uninstall", "POST");
      expect(u2.status).toBe(404);

      // User config still preserved after uninstall
      const afterConfig = await readFile(join(codexHome, "config.toml"), "utf8");
      expect(afterConfig).toContain("user-model");
    } finally { runtime.stop(); await rm(tmp, { recursive: true, force: true }); }
  });

  test("user edits after install survive restore/uninstall", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "cfgl2-"));
    const codexHome = join(tmp, "codex");
    const costGuardHome = join(tmp, "st");
    const runtime = await makeRuntime(codexHome, costGuardHome);
    try {
      await api(runtime, "/api/install", "POST");
      // User adds a non-CostGuard file after install
      await (await import("node:fs/promises")).mkdir(costGuardHome, { recursive: true });
      await writeFile(join(costGuardHome, "user-notes.txt"), "user data", "utf8");
      // Restore
      await api(runtime, "/api/restore", "POST");
      // User file survives
      const content = await readFile(join(costGuardHome, "user-notes.txt"), "utf8");
      expect(content).toBe("user data");
      // Uninstall
      await api(runtime, "/api/uninstall", "POST");
      const after = await readFile(join(costGuardHome, "user-notes.txt"), "utf8");
      expect(after).toBe("user data");
    } finally { runtime.stop(); await rm(tmp, { recursive: true, force: true }); }
  });

  test("doctor detects journal residue", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "cfgl3-"));
    const codexHome = join(tmp, "codex");
    const costGuardHome = join(tmp, "st");
    const runtime = await makeRuntime(codexHome, costGuardHome);
    try {
      await api(runtime, "/api/install", "POST");
      // Simulate journal residue
      await (await import("node:fs/promises")).mkdir(costGuardHome, { recursive: true });
      await writeFile(join(costGuardHome, ".costguard-owned-batch.json"), '{"version":1,"writes":[]}', "utf8");
      const doc = await api(runtime, "/api/doctor");
      expect(doc.status).toBe(503); // UNKNOWN due to journal residue
      expect(doc.body.findings).toContain("journal-residue");
    } finally { runtime.stop(); await rm(tmp, { recursive: true, force: true }); }
  });
});
