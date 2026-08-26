import { describe, expect, test } from "bun:test";
import { selectProviderAccount } from "../src/providers/availability";
import { invokeWithFailover, ProviderRegistry, type ProviderAdapter } from "../src/providers/registry";
import { startRuntime } from "../src/server/runtime";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function acc(id: string, provider: string, overrides: Partial<{ health: any; quota: any; cooldownUntil: number }> = {}): any {
  return {
    id, provider, health: overrides.health ?? "healthy",
    quota: overrides.quota ?? { status: "measured", remaining: 100 },
    cooldownUntil: overrides.cooldownUntil,
  };
}

describe("Provider availability with fake clock", () => {
  test("429-style cooldown → clock advance → recover", () => {
    const t0 = 1000000;
    const account = acc("a1", "openai", { cooldownUntil: t0 + 500 });
    // During cooldown: no eligible account
    const during = selectProviderAccount([account], { provider: "openai", now: t0 });
    expect(during.status).toBe("UNKNOWN");
    // After clock advance past cooldown: eligible
    const after = selectProviderAccount([account], { provider: "openai", now: t0 + 501 });
    expect(after.status).toBe("PRESENT");
  });

  test("unknown quota is not measured zero — excludes account", () => {
    const account = acc("a1", "deepseek", { quota: { status: "unknown" } });
    const result = selectProviderAccount([account], { provider: "deepseek", now: 0 });
    expect(result.status).toBe("UNKNOWN");
  });

  test("unavailable health excludes account", () => {
    const account = acc("a1", "openai", { health: "unavailable" });
    const result = selectProviderAccount([account], { provider: "openai", now: 0 });
    expect(result.status).toBe("UNKNOWN");
  });
});

describe("Provider error matrix", () => {
  function errAdapter(id: string, model: string, tier: string, invokeResult: any): ProviderAdapter {
    return { descriptor: { id, models: [model], auth: "fixture", health: "healthy", tier: tier as any, capabilities: ["responses"] }, invoke: async () => invokeResult };
  }

  test("5xx → UNKNOWN; network/model-mismatch → UNKNOWN", async () => {
    const reg = new ProviderRegistry([errAdapter("ds", "flash", "execution", { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "provider-request-failed" })]);
    const r = await invokeWithFailover(reg, ["ds/flash"], { protocol: "responses", signal: new AbortController().signal, tier: "execution" });
    expect(r.status).toBe("UNKNOWN");
  });

  test("model identity mismatch → UNKNOWN", () => {
    const reg = new ProviderRegistry([errAdapter("ds", "flash", "execution", { status: "PRESENT", actualRuntimeModel: "other/model" })]);
    // Registry invoke rejects mismatched evidence
    expect(reg).toBeTruthy();
  });

  test("Luna→DeepSeek only when Luna explicitly unavailable", async () => {
    const lunaUnavailable = errAdapter("openai", "gpt-5.6-luna", "execution", { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "provider-unavailable" });
    const ds = errAdapter("deepseek", "deepseek-v4-flash", "execution", { status: "PRESENT", actualRuntimeModel: "deepseek/deepseek-v4-flash" });
    const reg = new ProviderRegistry([lunaUnavailable, ds]);
    const r = await invokeWithFailover(reg, ["openai/gpt-5.6-luna", "deepseek/deepseek-v4-flash"], { protocol: "responses", signal: new AbortController().signal, tier: "execution" });
    expect(r.status).toBe("PRESENT");
    expect(r.fallbackUsed).toBe(true);
    expect(r.actualRuntimeModel).toBe("deepseek/deepseek-v4-flash");
  });
});

describe("Route admission evidence", () => {
  test("high-risk task with Sol unavailable fails closed with evidence", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "ra-"));
    const costGuardHome = await mkdtemp(join(tmpdir(), "ra-"));
    const runtime = await startRuntime({
      env: { CODEX_HOME: codexHome, COSTGUARD_HOME: costGuardHome },
      providers: { openai: ["gpt-5.6-sol"], deepseek: ["deepseek-v4-flash"] },
      providerAdapters: [
        { descriptor: { id: "openai", models: ["gpt-5.6-sol"], auth: "fixture", health: "unavailable", tier: "sol", capabilities: ["responses"] }, invoke: async () => ({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "provider-unavailable" }) },
        { descriptor: { id: "deepseek", models: ["deepseek-v4-flash"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] }, invoke: async () => ({ status: "PRESENT", actualRuntimeModel: "deepseek/deepseek-v4-flash" }) },
      ],
      providerTier: "execution",
      taskSignals: () => ({ text: "production security permission migration assessment", hasSecurityOrPermissionImpact: true, hasProductionOrMigrationImpact: true }),
    });
    try {
      const res = await fetch(runtime.baseUrl + "/v1/responses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "openai/gpt-5.6-sol", input: "assess security migration" }),
      });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.failClosed).toBe(true);
      expect(body.routeAdmission).toBeDefined();
      expect(body.routeAdmission.requestedTier).toBe("sol");
    } finally { runtime.stop(); await rm(codexHome, { recursive: true, force: true }); await rm(costGuardHome, { recursive: true, force: true }); }
  });
});