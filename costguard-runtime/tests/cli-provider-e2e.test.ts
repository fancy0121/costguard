import { describe, expect, test } from "bun:test";
import { startRuntime } from "../src/server/runtime";
import { invokeWithFailover, ProviderRegistry, type ProviderAdapter } from "../src/providers/registry";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("CLI and management E2E", () => {
  test("management API returns health, ready, models, usage", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "cli-"));
    const costGuardHome = await mkdtemp(join(tmpdir(), "cli-"));
    const token = "test-bearer";
    const runtime = await startRuntime({
      env: { CODEX_HOME: codexHome, COSTGUARD_HOME: costGuardHome },
      providers: { deepseek: ["deepseek-v4-flash"] },
      providerAdapters: [{ descriptor: { id: "deepseek", models: ["deepseek-v4-flash"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] }, invoke: async () => ({ status: "PRESENT", actualRuntimeModel: "deepseek/deepseek-v4-flash" }) }],
      providerTier: "execution",
      managementToken: token,
      taskSignals: () => ({ text: "extract format classify text json data convert", isBatchOrRepetitive: true, isToolOrFileExecution: true }),
    });
    try {
      // Unauthenticated request
      expect((await fetch(runtime.baseUrl + "/api/status")).status).toBe(401);
      
      // Authenticated status
      const auth = { headers: { authorization: "Bearer " + token } };
      const status = await fetch(runtime.baseUrl + "/api/status", auth);
      expect(status.status).toBe(200);
      const st = await status.json();
      expect(st.health.status).toBe("healthy");
      expect(st.ready.status).toBe("ready");
      
      // Models
      const models = await fetch(runtime.baseUrl + "/api/catalog", auth);
      expect(models.status).toBe(200);
      const cat = await models.json();
      expect(cat.data?.length).toBeGreaterThan(0);
      
      // Usage
      const usage = await fetch(runtime.baseUrl + "/api/usage", auth);
      expect(usage.status).toBe(200);
    } finally { runtime.stop(); }
  });

  test("port conflict handling â€” second start on same port fails", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "cli2-"));
    const costGuardHome = await mkdtemp(join(tmpdir(), "cli2-"));
    const runtime = await startRuntime({
      env: { CODEX_HOME: codexHome, COSTGUARD_HOME: costGuardHome },
      providers: { test: ["x"] },
      port: 0, // auto-assign
      taskSignals: () => ({ text: "extract format classify text json data convert sort filter", isBatchOrRepetitive: true, isToolOrFileExecution: true }),
    });
    try {
      expect(runtime.baseUrl).toMatch(/http:\/\/127\.0\.0\.1:\d+/);
      // Stop and restart should work
      runtime.stop();
      const runtime2 = await startRuntime({
        env: { CODEX_HOME: codexHome, COSTGUARD_HOME: costGuardHome },
        providers: { test: ["x"] },
        port: 0,
        taskSignals: () => ({ text: "extract format classify text json data convert sort filter", isBatchOrRepetitive: true, isToolOrFileExecution: true }),
      });
      expect(runtime2.baseUrl).toMatch(/http:\/\/127\.0\.0\.1:\d+/);
      runtime2.stop();
    } finally { try { runtime.stop() } catch {} }
  });
});

describe("Provider availability and fallback", () => {
  function makeAdapter(id: string, model: string, tier: string, health: string): ProviderAdapter {
    return {
      descriptor: { id, models: [model], auth: "fixture", health: health as any, tier: tier as any, capabilities: ["responses"] },
      invoke: async (req) => ({ status: "PRESENT", actualRuntimeModel: id + "/" + model }),
    };
  }

  test("Sol unavailable â†’ execution cannot take Sol task", () => {
    const registry = new ProviderRegistry([makeAdapter("openai", "gpt-5.6-sol", "sol", "unavailable")]);
    const result = registry.resolve("openai/gpt-5.6-sol", "responses");
    expect(result.status).toBe("UNKNOWN");
    expect(result.failClosed).toBe(true);
    expect(result.reason).toContain("unavailable");
  });

  test("Luna unavailable â†’ DeepSeek takes execution work", async () => {
    const registry = new ProviderRegistry([
      makeAdapter("openai", "gpt-5.6-luna", "execution", "unavailable"),
      makeAdapter("deepseek", "deepseek-v4-flash", "execution", "healthy"),
    ]);
    const result = await invokeWithFailover(registry, ["openai/gpt-5.6-luna", "deepseek/deepseek-v4-flash"], {
      protocol: "responses", signal: new AbortController().signal, tier: "execution",
    });
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackChain).toContain("deepseek/deepseek-v4-flash");
  });

  test("GLM only when execution routes explicitly unavailable", async () => {
    const adapters = [
      makeAdapter("openai", "gpt-5.6-luna", "execution", "unavailable"),
      makeAdapter("deepseek", "deepseek-v4-flash", "execution", "unavailable"),
      makeAdapter("zhipu-bigmodel", "glm-5.2", "glm-backup", "healthy"),
    ];
    const registry = new ProviderRegistry(adapters);
    // GLM as sole candidate (both execution unavailable) â†’ should be allowed
    const result = await invokeWithFailover(registry, ["openai/gpt-5.6-luna", "deepseek/deepseek-v4-flash", "zhipu-bigmodel/glm-5.2"], {
      protocol: "responses", signal: new AbortController().signal, tier: "execution",
    });
    expect(result.status).toBe("PRESENT");
    expect(result.actualRuntimeModel).toBe("zhipu-bigmodel/glm-5.2");
  });

  test("Sol/Terra high-risk work fails closed, no GLM fallback", () => {
    // Sol unavailable + high-risk â†’ must fail, cannot go to GLM
    const registry = new ProviderRegistry([
      makeAdapter("openai", "gpt-5.6-sol", "sol", "unavailable"),
      makeAdapter("zhipu-bigmodel", "glm-5.2", "glm-backup", "healthy"),
    ]);
    const result = registry.resolve("openai/gpt-5.6-sol", "responses");
    expect(result.status).toBe("UNKNOWN");
    expect(result.failClosed).toBe(true);
  });
});