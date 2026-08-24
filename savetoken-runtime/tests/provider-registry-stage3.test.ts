import { expect, test } from "bun:test";
import { invokeWithFailover, ProviderRegistry, type ProviderAdapter } from "../src/providers/registry";

const fixtureAdapter = (id: string, models: string[], health: "healthy" | "unknown" = "healthy"): ProviderAdapter => ({
  descriptor: {
    id,
    models,
    auth: "fixture",
    health,
    capabilities: ["responses", "chat", "anthropic", "streaming", "tools"],
  },
  invoke: async ({ signal, requestedModel }) => {
    if (signal.aborted) return { status: "cancelled", actualRuntimeModel: "UNKNOWN" };
    return { status: "PRESENT", actualRuntimeModel: requestedModel };
  },
});

test("registry exposes redacted provider descriptors and refuses unknown health", () => {
  const registry = new ProviderRegistry([
    fixtureAdapter("fixture", ["model-a"]),
    fixtureAdapter("unverified", ["model-b"], "unknown"),
  ]);

  expect(registry.catalog()).toEqual([
    {
      id: "fixture",
      models: ["model-a"],
      auth: "fixture",
      health: "healthy",
      capabilities: ["responses", "chat", "anthropic", "streaming", "tools"],
    },
    {
      id: "unverified",
      models: ["model-b"],
      auth: "fixture",
      health: "unknown",
      capabilities: ["responses", "chat", "anthropic", "streaming", "tools"],
    },
  ]);

  expect(registry.resolve("unverified/model-b", "responses")).toEqual({
    status: "UNKNOWN",
    failClosed: true,
    reason: "provider-health-unverified",
  });
});

test("registry rejects duplicate provider identifiers", () => {
  expect(() => new ProviderRegistry([fixtureAdapter("fixture", ["model-a"]), fixtureAdapter("fixture", ["model-b"])]))
    .toThrow("provider-id-duplicate");
});

test("registry rejects provider and model identifiers that cannot form safe routes", () => {
  expect(() => new ProviderRegistry([fixtureAdapter("../escape", ["model-a"])]))
    .toThrow("provider-id-invalid");
  expect(() => new ProviderRegistry([fixtureAdapter("fixture", ["model/a"])]))
    .toThrow("provider-model-invalid");
});

test("registry rejects an incomplete per-model tier map", () => {
  expect(() => new ProviderRegistry([{
    descriptor: { id: "fixture", models: ["model-a", "model-b"], modelTiers: { "model-a": "execution" }, auth: "fixture", health: "healthy", capabilities: ["responses"] },
    invoke: async () => ({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN" }),
  }])).toThrow("provider-model-tier-map-invalid");
});

test("registry rejects a provider-level tier that conflicts with model-level tiers", () => {
  expect(() => new ProviderRegistry([{
    descriptor: { id: "fixture", models: ["model-a", "model-b"], tier: "sol", modelTiers: { "model-a": "sol", "model-b": "execution" }, auth: "fixture", health: "healthy", capabilities: ["responses"] },
    invoke: async () => ({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN" }),
  }])).toThrow("provider-model-tier-conflict");
});

test("registry does not stream an unavailable route", async () => {
  let calls = 0;
  const registry = new ProviderRegistry([{
    descriptor: { id: "fixture", models: ["model-a"], auth: "fixture", health: "unavailable", tier: "execution", capabilities: ["responses"] },
    invoke: async () => ({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN" }),
    streamInvoke: async () => { calls += 1; return new Response("data: [DONE]\n\n"); },
  }]);
  const result = await registry.stream({ requestedModel: "fixture/model-a", protocol: "responses", signal: new AbortController().signal, body: { input: "fixture" } });
  expect(result).toMatchObject({ status: "UNKNOWN", reason: "provider-unavailable" });
  expect(calls).toBe(0);
});

test("registry rejects a non-SSE stream response before runtime forwarding", async () => {
  const registry = new ProviderRegistry([{
    descriptor: { id: "fixture", models: ["model-a"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] },
    invoke: async () => ({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN" }),
    streamInvoke: async () => Response.json({ model: "model-a" }),
  }]);
  const result = await registry.stream({ requestedModel: "fixture/model-a", protocol: "responses", signal: new AbortController().signal, body: { input: "fixture" } });
  expect(result).toEqual({ status: "UNKNOWN", reason: "stream-content-type-invalid" });
});

test("registry invokes a fixture route and preserves request cancellation", async () => {
  const registry = new ProviderRegistry([fixtureAdapter("fixture", ["model-a"])]);
  const controller = new AbortController();
  controller.abort();

  await expect(registry.invoke({
    requestedModel: "fixture/model-a",
    protocol: "responses",
    signal: controller.signal,
  })).resolves.toEqual({ status: "cancelled", actualRuntimeModel: "UNKNOWN" });
});

test("registry discards a provider result when cancellation happens during invocation", async () => {
  const controller = new AbortController();
  const registry = new ProviderRegistry([{
    descriptor: { id: "fixture", models: ["model-a"], auth: "fixture", health: "healthy", capabilities: ["responses"] },
    invoke: async ({ requestedModel }) => {
      controller.abort();
      return { status: "PRESENT", actualRuntimeModel: requestedModel, response: { status: "completed" } };
    },
  }]);

  await expect(registry.invoke({
    requestedModel: "fixture/model-a",
    protocol: "responses",
    signal: controller.signal,
  })).resolves.toEqual({ status: "cancelled", actualRuntimeModel: "UNKNOWN" });
});

test("registry rejects PRESENT results without matching runtime evidence", async () => {
  const registry = new ProviderRegistry([{
    descriptor: { id: "fixture", models: ["model-a"], auth: "fixture", health: "healthy", capabilities: ["responses"] },
    invoke: async () => ({ status: "PRESENT", actualRuntimeModel: "UNKNOWN" }),
  }]);

  await expect(registry.invoke({
    requestedModel: "fixture/model-a",
    protocol: "responses",
    signal: new AbortController().signal,
  })).resolves.toEqual({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "provider-evidence-unverified" });
});

test("high-risk failover rejects an execution-tier candidate before adapter invocation", async () => {
  let calls = 0;
  const adapter: ProviderAdapter = {
    descriptor: {
      id: "execution",
      models: ["model-a"],
      auth: "fixture",
      health: "healthy",
      tier: "execution",
      capabilities: ["responses"],
    },
    invoke: async () => {
      calls += 1;
      return { status: "PRESENT", actualRuntimeModel: "execution/model-a" };
    },
  };
  const registry = new ProviderRegistry([adapter]);

  const result = await invokeWithFailover(registry, ["execution/model-a"], {
    protocol: "responses",
    signal: new AbortController().signal,
    tier: "sol",
  });
  expect(result).toEqual({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "high-risk-provider-fallback-forbidden" });
  expect(calls).toBe(0);
});
