import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRuntime } from "../src/server/runtime";
import { createOpenCodexProxyAdapter } from "../src/providers/opencodex-proxy";

const TOKEN = "provider-control-plane-token";

test("provider control plane records a successful invocation with an explicit availability source", async () => {
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-provider-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-provider-state-")) },
    providers: { fixture: ["model"] }, managementToken: TOKEN, providerTier: "execution",
    taskSignals: () => ({ text: "extract isolated fixture value", isBatchOrRepetitive: true }),
    providerAdapters: [{ descriptor: { id: "fixture", models: ["model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] }, invoke: async (request) => ({ status: "PRESENT", actualRuntimeModel: request.requestedModel, response: { output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }] } }) }],
  });
  try {
    const before = await fetch(`${runtime.baseUrl}/api/providers`, { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(before.status).toBe(200);
    expect(await before.json()).toMatchObject({ data: [{ route: "fixture/model", availability: "available", source: "descriptor" }] });
    expect((await fetch(`${runtime.baseUrl}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "fixture/model", input: "fixture" }) })).status).toBe(200);
    const after = await fetch(`${runtime.baseUrl}/api/providers`, { headers: { authorization: `Bearer ${TOKEN}` } });
    const body = await after.json();
    expect(body.data).toEqual([expect.objectContaining({ route: "fixture/model", availability: "available", source: "recent-success", lastSuccessAt: expect.any(String) })]);
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  } finally { runtime.stop(); }
});

test("provider control plane records an adapter failure as unknown without exposing request data", async () => {
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-provider-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-provider-state-")) },
    providers: { fixture: ["model"] }, managementToken: TOKEN, providerTier: "execution",
    taskSignals: () => ({ text: "extract isolated fixture value", isBatchOrRepetitive: true }),
    providerAdapters: [{ descriptor: { id: "fixture", models: ["model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] }, invoke: async () => ({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "provider-request-failed" }) }],
  });
  try {
    const result = await fetch(`${runtime.baseUrl}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "fixture/model", input: "sensitive prompt must not appear" }) });
    expect(result.status).toBe(502);
    const providers = await fetch(`${runtime.baseUrl}/api/providers`, { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(await providers.json()).toMatchObject({ data: [{ route: "fixture/model", availability: "unknown", source: "recent-failure", lastFailureReason: "provider-request-failed" }] });
  } finally { runtime.stop(); }
});

test("provider control plane makes a 429-style failure unavailable through cooldown, then permits a later retry", async () => {
  let clock = 1_000;
  let calls = 0;
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-provider-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-provider-state-")) },
    providers: { fixture: ["model"] }, managementToken: TOKEN, providerTier: "execution", now: () => clock, providerCooldownMs: 500,
    taskSignals: () => ({ text: "extract isolated fixture value", isBatchOrRepetitive: true }),
    providerAdapters: [{ descriptor: { id: "fixture", models: ["model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] }, invoke: async (request) => {
      calls += 1;
      return calls === 1
        ? { status: "UNKNOWN" as const, actualRuntimeModel: "UNKNOWN" as const, reason: "provider-rate-limited" }
        : { status: "PRESENT" as const, actualRuntimeModel: request.requestedModel, response: { output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }] } };
    } }],
  });
  try {
    const request = () => fetch(`${runtime.baseUrl}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "fixture/model", input: "fixture" }) });
    expect((await request()).status).toBe(429);
    const readyDuringCooldown = await fetch(`${runtime.baseUrl}/readyz`);
    expect(readyDuringCooldown.status).toBe(503);
    expect(await readyDuringCooldown.json()).toEqual({ status: "failed", reason: "provider-runtime-unavailable" });
    const cooling = await fetch(`${runtime.baseUrl}/api/providers`, { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(await cooling.json()).toMatchObject({ data: [{ route: "fixture/model", availability: "unavailable", source: "recent-failure", lastFailureReason: "provider-rate-limited", cooldownUntil: expect.any(String) }] });
    expect((await request()).status).toBe(503);
    expect(calls).toBe(1);
    clock += 501;
    expect((await request()).status).toBe(200);
    expect((await fetch(`${runtime.baseUrl}/readyz`)).status).toBe(200);
    expect(calls).toBe(2);
  } finally { runtime.stop(); }
});

test("provider control plane excludes adapter models that the runtime did not explicitly configure", async () => {
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-provider-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-provider-state-")) },
    providers: { fixture: ["configured"] }, managementToken: TOKEN,
    providerAdapters: [{
      descriptor: { id: "fixture", models: ["configured", "not-configured"], modelTiers: { configured: "execution", "not-configured": "sol" }, auth: "fixture", health: "healthy", capabilities: ["responses"] },
      invoke: async (request) => ({ status: "PRESENT", actualRuntimeModel: request.requestedModel }),
    }],
  });
  try {
    const providers = await fetch(`${runtime.baseUrl}/api/providers`, { headers: { authorization: `Bearer ${TOKEN}` } });
    const text = await providers.text();
    expect(JSON.parse(text)).toMatchObject({ data: [{ route: "fixture/configured" }] });
    expect(text).not.toContain("not-configured");
  } finally { runtime.stop(); }
});

test("proxy descriptor health does not alone make a Provider route ready", async () => {
  const proxy = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch: () => Response.json({ model: "deepseek-v4-flash", output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }] }),
  });
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-provider-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-provider-state-")) },
    providers: { deepseek: ["deepseek-v4-flash"] }, managementToken: TOKEN,
    providerAdapters: [createOpenCodexProxyAdapter({ baseUrl: proxy.url.toString().replace(/\/$/, "") })],
    taskSignals: () => ({ text: "extract isolated fixture value", isBatchOrRepetitive: true }),
  });
  try {
    expect((await fetch(`${runtime.baseUrl}/readyz`)).status).toBe(503);
    expect((await fetch(`${runtime.baseUrl}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "deepseek/deepseek-v4-flash", input: "fixture" }) })).status).toBe(200);
    expect((await fetch(`${runtime.baseUrl}/readyz`)).status).toBe(200);
  } finally { runtime.stop(); proxy.stop(); }
});

test("proxy streaming fails closed before unverified terminal model bytes are exposed", async () => {
  const proxy = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch: () => new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } }),
  });
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-provider-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-provider-state-")) },
    providers: { deepseek: ["deepseek-v4-flash"] },
    providerAdapters: [createOpenCodexProxyAdapter({ baseUrl: proxy.url.toString().replace(/\/$/, "") })],
    taskSignals: () => ({ text: "extract isolated fixture value", isBatchOrRepetitive: true }),
  });
  try {
    const result = await fetch(`${runtime.baseUrl}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "deepseek/deepseek-v4-flash", input: "fixture", stream: true }) });
    expect(result.status).toBe(422);
    expect(await result.json()).toMatchObject({ status: "UNKNOWN", failClosed: true, reason: "stream-terminal-identity-unverified" });
  } finally { runtime.stop(); proxy.stop(); }
});
