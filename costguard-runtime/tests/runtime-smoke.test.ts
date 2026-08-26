import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRuntime } from "../src/server/runtime";
import type { ProviderAdapter } from "../src/providers/registry";

const fixtureManagementToken = ["fixture", "management", "token"].join("-");
const executionSignals = () => ({
  text: "extract the title and date from each markdown file",
  isBatchOrRepetitive: true,
  isToolOrFileExecution: true,
});

test("runtime starts in isolated homes and separates health from readiness", async () => {
  const codexHome = await mkdtemp(join(tmpdir(), "costguard-codex-") );
  const costGuardHome = await mkdtemp(join(tmpdir(), "costguard-state-") );
  const runtime = await startRuntime({
    env: { CODEX_HOME: codexHome, COSTGUARD_HOME: costGuardHome },
    providers: { openai: ["gpt-5.6-sol"] },
    providerAdapters: [{
      descriptor: { id: "openai", models: ["gpt-5.6-sol"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses", "chat", "anthropic"] },
      invoke: async ({ requestedModel }) => ({ status: "PRESENT", actualRuntimeModel: requestedModel }),
    }],
    providerTier: "execution",
    taskSignals: executionSignals,
  });

  try {
    expect(new URL(runtime.baseUrl).hostname).toBe("127.0.0.1");
    expect((await fetch(`${runtime.baseUrl}/healthz`)).status).toBe(200);
    expect((await fetch(`${runtime.baseUrl}/readyz`)).status).toBe(200);
    expect(await (await fetch(`${runtime.baseUrl}/readyz`)).json()).toEqual({ status: "ready" });
    expect(await readdir(codexHome)).toEqual([]);
    expect((await readdir(costGuardHome)).length).toBeGreaterThan(0);
    expect(JSON.parse(await readFile(join(costGuardHome, "runtime.json"), "utf8")).baseUrl).toBe(runtime.baseUrl);
  } finally {
    runtime.stop();
  }
});

test("runtime does not report ready without a configured provider", async () => {
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-state-")) },
    providers: {},
  });

  try {
    expect((await fetch(`${runtime.baseUrl}/readyz`)).status).toBe(503);
  } finally {
    runtime.stop();
  }
});

test("runtime does not report ready from an unverified catalog alone", async () => {
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-state-")) },
    providers: { fixture: ["model-a"] },
  });

  try {
    expect((await fetch(`${runtime.baseUrl}/readyz`)).status).toBe(503);
  } finally {
    runtime.stop();
  }
});

test("runtime exposes catalog routes without claiming provider invocation", async () => {
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-state-")) },
    providers: { openai: ["gpt-5.6-sol"] },
  });

  try {
    const models = await (await fetch(`${runtime.baseUrl}/v1/models`)).json();
    expect(models.data).toEqual([{ id: "openai/gpt-5.6-sol", provider: "openai" }]);

    const routeResponse = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-5.6-sol", input: "hello" }),
    });
    expect(routeResponse.status).toBe(503);
    const route = await routeResponse.json();
    expect(route.status).toBe("UNKNOWN");
    expect(route.reason).toBe("provider-tier-unverified");
    expect(route.actualRuntimeModel).toBeUndefined();
  } finally {
    runtime.stop();
  }
});

test("runtime invokes an explicitly injected credential-free fixture adapter", async () => {
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-state-")) },
    providers: { fixture: ["model-a"] },
    providerTier: "execution",
    providerAdapters: [{
      descriptor: {
        id: "fixture",
        models: ["model-a"],
        auth: "fixture",
        health: "healthy",
        tier: "execution",
        capabilities: ["responses", "chat", "anthropic"],
      },
      invoke: async () => ({ status: "PRESENT", actualRuntimeModel: "fixture/model-a" }),
    }],
    taskSignals: executionSignals,
  });

  try {
    const response = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture/model-a", input: "hello" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ object: "response", status: "completed", model: "fixture/model-a" });
  } finally {
    runtime.stop();
  }
});

test("runtime derives route admission tier from the registered explicit model descriptor", async () => {
  let calls = 0;
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-state-")) },
    providers: { openai: ["gpt-5.6-sol"], deepseek: ["deepseek-v4-flash"] },
    providerAdapters: [
      {
        descriptor: { id: "openai", models: ["gpt-5.6-sol"], auth: "fixture", health: "healthy", tier: "sol", capabilities: ["responses"] },
        invoke: async ({ requestedModel }) => { calls += 1; return { status: "PRESENT", actualRuntimeModel: requestedModel }; },
      },
      {
        descriptor: { id: "deepseek", models: ["deepseek-v4-flash"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] },
        invoke: async ({ requestedModel }) => { calls += 1; return { status: "PRESENT", actualRuntimeModel: requestedModel }; },
      },
    ],
  });

  try {
    const sol = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-5.6-sol", input: "production permission migration must be reviewed" }),
    });
    expect(sol.status).toBe(200);
    expect(await sol.json()).toMatchObject({ model: "openai/gpt-5.6-sol" });
    expect(JSON.parse(sol.headers.get("x-costguard-route-admission")!)).toMatchObject({ requestedTier: "sol", selectedProviderTier: "sol", decidingTier: "sol" });

    const execution = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "deepseek/deepseek-v4-flash", input: "production permission migration must be reviewed" }),
    });
    expect(execution.status).toBe(503);
    expect(await execution.json()).toMatchObject({ reason: "task-tier-candidate-mismatch", routeAdmission: { requestedTier: "sol", selectedProviderTier: "execution" } });
    expect(calls).toBe(1);
  } finally {
    runtime.stop();
  }
});

test("runtime auto-selects only a uniquely configured execution candidate from trusted signals", async () => {
  const calls: string[] = [];
  const forwardedBodies: Array<Record<string, unknown> | undefined> = [];
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-state-")) },
    providers: { openai: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"], deepseek: ["deepseek-v4-flash"], "zhipu-bigmodel": ["glm-5.2"] },
    providerAdapters: [
      { descriptor: { id: "openai", models: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"], modelTiers: { "gpt-5.6-sol": "sol", "gpt-5.6-terra": "terra", "gpt-5.6-luna": "execution" }, auth: "fixture", health: "healthy", capabilities: ["responses"] }, invoke: async ({ requestedModel }) => { calls.push(requestedModel); return { status: "PRESENT", actualRuntimeModel: requestedModel }; } },
      { descriptor: { id: "deepseek", models: ["deepseek-v4-flash"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] }, invoke: async ({ requestedModel, body }) => { calls.push(requestedModel); forwardedBodies.push(body ? { ...body } : undefined); return { status: "PRESENT", actualRuntimeModel: requestedModel }; } },
      { descriptor: { id: "zhipu-bigmodel", models: ["glm-5.2"], auth: "fixture", health: "healthy", tier: "glm-backup", capabilities: ["responses"] }, invoke: async ({ requestedModel }) => { calls.push(requestedModel); return { status: "PRESENT", actualRuntimeModel: requestedModel }; } },
    ],
    taskSignals: () => ({ text: "extract the title and date from each isolated record", isBatchOrRepetitive: true }),
  });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "extract the title and date from each isolated record" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ model: "deepseek/deepseek-v4-flash" });
    expect(calls).toEqual(["deepseek/deepseek-v4-flash"]);
    expect(forwardedBodies).toEqual([expect.objectContaining({ model: "deepseek/deepseek-v4-flash" })]);
  } finally { runtime.stop(); }
});

test("runtime does not auto-select execution without trusted structured signals", async () => {
  let calls = 0;
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-state-")) },
    providers: { deepseek: ["deepseek-v4-flash"] },
    providerAdapters: [{ descriptor: { id: "deepseek", models: ["deepseek-v4-flash"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] }, invoke: async ({ requestedModel }) => { calls += 1; return { status: "PRESENT", actualRuntimeModel: requestedModel }; } }],
  });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "extract the title and date from each isolated record" }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "UNKNOWN", failClosed: true, reason: "trusted-execution-signals-required" });
    expect(calls).toBe(0);
  } finally { runtime.stop(); }
});

test("protocol validation errors carry route-admission evidence and do not invoke the adapter", async () => {
  let calls = 0;
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-state-")) },
    providers: { fixture: ["model-a"] },
    providerTier: "execution",
    taskSignals: executionSignals,
    providerAdapters: [{
      descriptor: { id: "fixture", models: ["model-a"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] },
      invoke: async () => { calls += 1; return { status: "PRESENT", actualRuntimeModel: "fixture/model-a" }; },
    }],
  });

  try {
    const response = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture/model-a" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      status: "UNKNOWN",
      failClosed: true,
      reason: "responses-input-required",
      routeAdmission: { decidingTier: "execution", selectedProviderTier: "execution", signalSource: "structured" },
    });
    expect(calls).toBe(0);
  } finally {
    runtime.stop();
  }
});

test("runtime rejects a high-risk task before an execution-tier adapter can run", async () => {
  let calls = 0;
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-state-")) },
    providers: { fixture: ["model-a"] },
    providerTier: "execution",
    providerAdapters: [{
      descriptor: { id: "fixture", models: ["model-a"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] },
      invoke: async () => { calls += 1; return { status: "PRESENT", actualRuntimeModel: "fixture/model-a" }; },
    }],
  });

  try {
    const response = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture/model-a", input: "生产环境权限迁移" }),
    });
    expect(response.status).toBe(503);
    expect(calls).toBe(0);
  } finally {
    runtime.stop();
  }
});

test("runtime fails closed for execution when server-side route signals are absent", async () => {
  let calls = 0;
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-state-")) },
    providers: { fixture: ["model-a"] },
    providerTier: "execution",
    providerAdapters: [{
      descriptor: { id: "fixture", models: ["model-a"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] },
      invoke: async () => { calls += 1; return { status: "PRESENT", actualRuntimeModel: "fixture/model-a" }; },
    }],
  });

  try {
    const response = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture/model-a", input: "update the bounded implementation across several modules" }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "UNKNOWN", failClosed: true, reason: "task-tier-candidate-mismatch", routeAdmission: { signalSource: "unavailable", requestedTier: "terra", selectedProviderTier: "execution" } });
    expect(calls).toBe(0);
  } finally {
    runtime.stop();
  }
});

test("runtime fails closed when server-side route signal generation throws", async () => {
  let calls = 0;
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-state-")) },
    providers: { fixture: ["model-a"] },
    providerTier: "execution",
    taskSignals: () => { throw new Error("signal fixture failure"); },
    providerAdapters: [{
      descriptor: { id: "fixture", models: ["model-a"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] },
      invoke: async () => { calls += 1; return { status: "PRESENT", actualRuntimeModel: "fixture/model-a" }; },
    }],
  });

  try {
    const response = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture/model-a", input: "hello" }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "UNKNOWN", failClosed: true, reason: "task-tier-candidate-mismatch", routeAdmission: { signalSource: "unavailable", requestedTier: "terra", selectedProviderTier: "execution" } });
    expect(calls).toBe(0);
  } finally {
    runtime.stop();
  }
});

test("runtime preserves an explicit requested route before configured execution fallback", async () => {
  const calls: string[] = [];
  const makeAdapter = (id: string): ProviderAdapter => ({
    descriptor: { id, models: ["model-a"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] },
    invoke: async ({ requestedModel }) => { calls.push(requestedModel); return { status: "PRESENT", actualRuntimeModel: requestedModel }; },
  });
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-state-")) },
    providers: { requested: ["model-a"], override: ["model-a"] },
    providerTier: "execution",
    providerRoutes: ["override/model-a"],
    taskSignals: executionSignals,
    providerAdapters: [makeAdapter("requested"), makeAdapter("override")],
  });

  try {
    const response = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "requested/model-a", input: "fixture" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ object: "response", status: "completed", model: "requested/model-a" });
    expect(calls).toEqual(["requested/model-a"]);
  } finally {
    runtime.stop();
  }
});

test("runtime readiness requires a healthy adapter matching a declared route", async () => {
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-state-")) },
    providers: { requested: ["model-a"] },
    providerTier: "execution",
    providerAdapters: [{
      descriptor: { id: "other", models: ["model-b"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] },
      invoke: async ({ requestedModel }) => ({ status: "PRESENT", actualRuntimeModel: requestedModel }),
    }],
  });

  try {
    expect((await fetch(`${runtime.baseUrl}/readyz`)).status).toBe(503);
  } finally {
    runtime.stop();
  }
});

test("unknown provider route fails closed", async () => {
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-state-")) },
    providers: { openai: ["gpt-5.6-sol"] },
  });

  try {
    const response = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "missing/model", input: "hello" }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "UNKNOWN", failClosed: true });
  } finally {
    runtime.stop();
  }
});

test("runtime propagates cancellation into request processing", async () => {
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-state-")) },
    providers: { openai: ["gpt-5.6-sol"] },
    beforeRoute: (token) => token.cancel(),
  });

  try {
    const response = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-5.6-sol", input: "hello" }),
    });
    expect(response.status).toBe(499);
    expect(await response.json()).toMatchObject({ status: "cancelled", failClosed: true });
  } finally {
    runtime.stop();
  }
});

test("runtime exposes an independently authenticated management plane", async () => {
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-state-")) },
    providers: { openai: ["gpt-5.6-sol"] },
    providerTier: "execution",
    providerAdapters: [{
      descriptor: { id: "openai", models: ["gpt-5.6-sol"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses", "chat", "anthropic"] },
      invoke: async ({ requestedModel }) => ({ status: "PRESENT", actualRuntimeModel: requestedModel }),
    }],
    managementToken: fixtureManagementToken,
    taskSignals: executionSignals,
    restore: async () => ({ status: "PRESENT" }),
    uninstall: async () => ({ status: "PRESENT" }),
  });

  try {
    expect((await fetch(`${runtime.baseUrl}/api/status`)).status).toBe(401);
    const response = await fetch(`${runtime.baseUrl}/api/status`, {
      headers: { authorization: `Bearer ${fixtureManagementToken}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ health: { status: "healthy" }, ready: { status: "ready" } });

    const preview = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-5.6-sol", input: "fixture" }),
    });
    expect(preview.status).toBe(200);
    const usage = await fetch(`${runtime.baseUrl}/api/usage`, {
      headers: { authorization: `Bearer ${fixtureManagementToken}` },
    });
    expect(await usage.json()).toEqual({ requests: 1, measuredTokenRequests: 0, unreportedRequests: 1 });
    const logs = await fetch(`${runtime.baseUrl}/api/logs`, {
      headers: { authorization: `Bearer ${fixtureManagementToken}` },
    });
    expect(await logs.json()).toMatchObject([{ event: "responses.completed", status: "PRESENT" }]);
  } finally {
    runtime.stop();
  }
});
