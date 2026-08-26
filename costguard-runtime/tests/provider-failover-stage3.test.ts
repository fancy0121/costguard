import { expect, test } from "bun:test";
import { invokeWithFailover, ProviderRegistry, type ProviderAdapter } from "../src/providers/registry";

const adapter = (id: string, health: "healthy" | "unavailable"): ProviderAdapter => ({
  descriptor: { id, models: ["model-a"], auth: "fixture", health, tier: "execution", capabilities: ["responses"] },
  invoke: async () => ({ status: "PRESENT", actualRuntimeModel: `${id}/model-a` }),
});

test("low-risk fixture requests may fail over within explicit candidates", async () => {
  const registry = new ProviderRegistry([adapter("first", "unavailable"), adapter("second", "healthy")]);
  const result = await invokeWithFailover(registry, ["first/model-a", "second/model-a"], {
    protocol: "responses",
    signal: new AbortController().signal,
    tier: "execution",
  });
  expect(result).toMatchObject({ status: "PRESENT", actualRuntimeModel: "second/model-a", fallbackUsed: true, fallbackChain: ["first/model-a", "second/model-a"] });
});

test("high-risk fixture requests fail closed instead of silently failing over", async () => {
  const registry = new ProviderRegistry([adapter("first", "unavailable"), adapter("second", "healthy")]);
  await expect(invokeWithFailover(registry, ["first/model-a", "second/model-a"], {
    protocol: "responses",
    signal: new AbortController().signal,
    tier: "sol",
  })).resolves.toEqual({
    status: "UNKNOWN",
    actualRuntimeModel: "UNKNOWN",
    reason: "high-risk-provider-fallback-forbidden",
  });
});

test("adapter exceptions are redacted and do not authorize low-risk failover", async () => {
  const throwing: ProviderAdapter = {
    descriptor: { id: "throwing", models: ["model-a"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] },
    invoke: async () => { throw new Error("fixture adapter failure"); },
  };
  const healthy = adapter("healthy", "healthy");
  const registry = new ProviderRegistry([throwing, healthy]);

  await expect(invokeWithFailover(registry, ["throwing/model-a", "healthy/model-a"], {
    protocol: "responses",
    signal: new AbortController().signal,
    tier: "execution",
  })).resolves.toEqual({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "provider-adapter-failed" });
});

test("GLM backup cannot be selected without explicit execution-route unavailability", async () => {
  let calls = 0;
  const glm: ProviderAdapter = {
    descriptor: { id: "glm", models: ["model-b"], auth: "fixture", health: "healthy", tier: "glm-backup", capabilities: ["responses"] },
    invoke: async () => { calls += 1; return { status: "PRESENT", actualRuntimeModel: "glm/model-b" }; },
  };
  const registry = new ProviderRegistry([glm]);

  await expect(invokeWithFailover(registry, ["glm/model-b"], {
    protocol: "responses",
    signal: new AbortController().signal,
    tier: "execution",
  })).resolves.toEqual({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "glm-backup-prerequisite-unavailable" });
  expect(calls).toBe(0);
});
