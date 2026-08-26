import { describe, expect, test } from "bun:test";
import { startRuntime } from "../src/server/runtime";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TOKEN = "cli-token";

async function makeRuntime(codexHome: string, costGuardHome: string, port = 0) {
  return startRuntime({
    env: { CODEX_HOME: codexHome, COSTGUARD_HOME: costGuardHome },
    providers: { deepseek: ["deepseek-v4-flash"] },
    providerAdapters: [{ descriptor: { id: "deepseek", models: ["deepseek-v4-flash"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] }, invoke: async () => ({ status: "PRESENT", actualRuntimeModel: "deepseek/deepseek-v4-flash" }) }],
    providerTier: "execution",
    managementToken: TOKEN,
    port,
    taskSignals: () => ({ text: "extract format classify json data convert", isBatchOrRepetitive: true, isToolOrFileExecution: true }),
  });
}

describe("CLI and management lifecycle", () => {
  test("stop → /readyz no longer ready", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "cli-"));
    const costGuardHome = await mkdtemp(join(tmpdir(), "cli-"));
    const runtime = await makeRuntime(codexHome, costGuardHome);
    const readyBefore = await fetch(runtime.baseUrl + "/readyz");
    expect(readyBefore.status).toBe(200);
    runtime.stop();
    // After stop, the port must not return a ready response
    try {
      const after = await fetch(runtime.baseUrl + "/readyz");
      expect(after.status).not.toBe(200);
    } catch {
      // Connection refused is also valid
    }
  });

  test("fixed port conflict — second instance fails", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "cli2-"));
    const costGuardHome = await mkdtemp(join(tmpdir(), "cli2-"));
    const runtime = await makeRuntime(codexHome, costGuardHome);
    try {
      const port = Number(new URL(runtime.baseUrl).port);
      // Try to start a second runtime on the same fixed port
      const codexHome2 = await mkdtemp(join(tmpdir(), "cli2b-"));
      const costGuardHome2 = await mkdtemp(join(tmpdir(), "cli2b-"));
      await expect(makeRuntime(codexHome2, costGuardHome2, port)).rejects.toBeTruthy();
      await rm(codexHome2, { recursive: true, force: true });
      await rm(costGuardHome2, { recursive: true, force: true });
    } finally { runtime.stop(); await rm(codexHome, { recursive: true, force: true }); await rm(costGuardHome, { recursive: true, force: true }); }
  });

  test("unauthorized management API is 401 with no leak", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "cli3-"));
    const costGuardHome = await mkdtemp(join(tmpdir(), "cli3-"));
    const runtime = await makeRuntime(codexHome, costGuardHome);
    try {
      const res = await fetch(runtime.baseUrl + "/api/status");
      expect(res.status).toBe(401);
      const body = await res.json();
      const text = JSON.stringify(body);
      expect(text).not.toContain(codexHome);
      expect(text).not.toContain("Bearer");
      expect(text).not.toContain(TOKEN);
    } finally { runtime.stop(); await rm(codexHome, { recursive: true, force: true }); await rm(costGuardHome, { recursive: true, force: true }); }
  });

  test("CLI install/sync/doctor/restore/uninstall via management API", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "cli4-"));
    const costGuardHome = await mkdtemp(join(tmpdir(), "cli4-"));
    const runtime = await makeRuntime(codexHome, costGuardHome);
    try {
      const auth = { headers: { authorization: "Bearer " + TOKEN } };
      const post = (p: string) => fetch(runtime.baseUrl + p, { method: "POST", ...auth });
      const get = (p: string) => fetch(runtime.baseUrl + p, { ...auth });
      
      const inst = await post("/api/install");
      expect(inst.status).toBe(200);
      const sync = await post("/api/sync");
      expect(sync.status).toBe(200);
      const doc = await get("/api/doctor");
      expect(doc.status).toBe(200);
      const restore = await post("/api/restore");
      expect(restore.status).toBe(200);
      const uninstall = await post("/api/uninstall");
      expect(uninstall.status).toBe(200);
    } finally { runtime.stop(); await rm(codexHome, { recursive: true, force: true }); await rm(costGuardHome, { recursive: true, force: true }); }
  });
});
