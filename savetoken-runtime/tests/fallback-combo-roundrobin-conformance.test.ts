import { expect, test } from "bun:test";
import { ComboRouter, type ComboDefinition } from "../src/codex/policy";
import { startRuntime } from "../src/server/runtime";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const routes = ["deepseek/deepseek-v4-flash", "openai/gpt-5.6-luna"];
const tiers = { "deepseek/deepseek-v4-flash": "execution", "openai/gpt-5.6-luna": "execution", "zhipu-bigmodel/glm-5.2": "glm-backup" } as const;

test("configured combo aliases resolve exactly and rotate only across verified available execution targets", () => {
  const combos: ComboDefinition[] = [{
    id: "execution-fast",
    aliases: ["fast-execution"],
    tier: "execution",
    strategy: "round-robin",
    targets: [{ route: routes[0] }, { route: routes[1] }],
  }];
  const router = new ComboRouter(combos, new Set(routes), tiers);
  const available = () => "available" as const;

  const first = router.resolve("combo/execution-fast", available);
  expect(first).toMatchObject({ status: "PRESENT", id: "execution-fast", routes: routes });
  router.recordSuccess("execution-fast", routes[0]);
  const second = router.resolve("fast-execution", available);
  expect(second).toMatchObject({ status: "PRESENT", routes: [routes[1], routes[0]] });

  const unknown = router.resolve("combo/execution-fast", (route) => route === routes[0] ? "unknown" : "available");
  expect(unknown).toMatchObject({ status: "PRESENT", routes: [routes[1]] });

  const weighted = new ComboRouter([{ id: "weighted", tier: "execution", strategy: "round-robin", targets: [{ route: routes[0], weight: 2 }, { route: routes[1], weight: 1 }] }], new Set(routes), tiers);
  expect(weighted.resolve("combo/weighted", available)).toMatchObject({ status: "PRESENT", routes: [routes[0], routes[1]] });
  weighted.recordSuccess("weighted", routes[0]);
  expect(weighted.resolve("combo/weighted", available)).toMatchObject({ status: "PRESENT", routes: [routes[0], routes[1]] });
  weighted.recordSuccess("weighted", routes[0]);
  expect(weighted.resolve("combo/weighted", available)).toMatchObject({ status: "PRESENT", routes: [routes[1], routes[0]] });
});

test("combo admission fails closed for ambiguous aliases and any GLM promotion", () => {
  const ambiguous = new ComboRouter([
    { id: "one", aliases: ["same"], tier: "execution", strategy: "failover", targets: [{ route: routes[0] }] },
    { id: "two", aliases: ["same"], tier: "execution", strategy: "failover", targets: [{ route: routes[1] }] },
  ], new Set(routes), tiers);
  expect(ambiguous.resolve("same", () => "available")).toEqual({ status: "UNKNOWN", failClosed: true, reason: "combo-alias-ambiguous" });

  const prematureGlm = new ComboRouter([{
    id: "unsafe", tier: "execution", strategy: "failover",
    targets: [{ route: routes[0] }, { route: "zhipu-bigmodel/glm-5.2" }],
  }], new Set([...routes, "zhipu-bigmodel/glm-5.2"]), tiers);
  expect(prematureGlm.resolve("combo/unsafe", () => "available")).toEqual({ status: "UNKNOWN", failClosed: true, reason: "glm-backup-order-invalid" });

  const nominalGlm = new ComboRouter([{
    id: "also-unsafe", tier: "execution", strategy: "failover",
    targets: [{ route: routes[0] }, { route: routes[1] }, { route: "zhipu-bigmodel/glm-5.2" }],
  }], new Set([...routes, "zhipu-bigmodel/glm-5.2"]), tiers);
  expect(nominalGlm.resolve("combo/also-unsafe", () => "available")).toEqual({ status: "UNKNOWN", failClosed: true, reason: "glm-backup-order-invalid" });
});

test("runtime executes a configured execution combo with route admission", async () => {
  const calls: string[] = [];
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "combo-codex-")), SAVETOKEN_HOME: await mkdtemp(join(tmpdir(), "combo-state-")) },
    providers: { deepseek: ["deepseek-v4-flash"], openai: ["gpt-5.6-luna"] },
    combos: [{ id: "execution-fast", aliases: ["fast-execution"], tier: "execution", strategy: "round-robin", targets: [{ route: routes[0] }, { route: routes[1] }] }],
    taskSignals: () => ({ text: "extract fields from isolated records", isBatchOrRepetitive: true }),
    providerAdapters: [
      { descriptor: { id: "deepseek", models: ["deepseek-v4-flash"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] }, invoke: async ({ requestedModel }) => { calls.push(requestedModel); return { status: "PRESENT", actualRuntimeModel: requestedModel }; } },
      { descriptor: { id: "openai", models: ["gpt-5.6-luna"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] }, invoke: async ({ requestedModel }) => { calls.push(requestedModel); return { status: "PRESENT", actualRuntimeModel: requestedModel }; } },
    ],
  });
  try {
    const first = await fetch(`${runtime.baseUrl}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "combo/execution-fast", input: "extract fields from isolated records" }) });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ model: routes[0] });
    expect(JSON.parse(first.headers.get("x-savetoken-route-admission")!)).toMatchObject({ logicalComboId: "execution-fast", selectedProviderTier: "execution" });
    const second = await fetch(`${runtime.baseUrl}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "fast-execution", input: "extract fields from isolated records" }) });
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ model: routes[1] });
    expect(calls).toEqual(routes);
  } finally { runtime.stop(); }
});

test("runtime combo excludes an unknown peer rather than invoking or promoting it", async () => {
  const calls: string[] = [];
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "combo-unknown-codex-")), SAVETOKEN_HOME: await mkdtemp(join(tmpdir(), "combo-unknown-state-")) },
    providers: { deepseek: ["deepseek-v4-flash"], openai: ["gpt-5.6-luna"] },
    combos: [{ id: "execution-fast", tier: "execution", strategy: "failover", targets: [{ route: routes[0] }, { route: routes[1] }] }],
    taskSignals: () => ({ text: "extract fields from isolated records", isBatchOrRepetitive: true }),
    providerAdapters: [
      { descriptor: { id: "deepseek", models: ["deepseek-v4-flash"], auth: "fixture", health: "unknown", tier: "execution", capabilities: ["responses"] }, invoke: async ({ requestedModel }) => { calls.push(requestedModel); return { status: "PRESENT", actualRuntimeModel: requestedModel }; } },
      { descriptor: { id: "openai", models: ["gpt-5.6-luna"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] }, invoke: async ({ requestedModel }) => { calls.push(requestedModel); return { status: "PRESENT", actualRuntimeModel: requestedModel }; } },
    ],
  });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "combo/execution-fast", input: "extract fields from isolated records" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ model: routes[1] });
    expect(calls).toEqual([routes[1]]);
  } finally { runtime.stop(); }
});
