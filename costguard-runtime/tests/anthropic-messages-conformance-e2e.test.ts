import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRuntime } from "../src/server/runtime";
import type { ProviderAdapter } from "../src/providers/registry";

function executionSignals() {
  return { text: "classify these local fixture records", isBatchOrRepetitive: true };
}

test("Anthropic Messages E2E preserves native content, tool_use terminal state, and usage", async () => {
  const adapter: ProviderAdapter = {
    descriptor: { id: "fixture", models: ["claude-like"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["anthropic"] },
    invoke: async (request) => ({
      status: "PRESENT",
      actualRuntimeModel: request.requestedModel,
      response: {
        id: "msg-native-tool-use",
        type: "message",
        model: "claude-like",
        role: "assistant",
        content: [{ type: "tool_use", id: "toolu_1", name: "classify_fixture", input: { category: "A" } }],
        stop_reason: "tool_use",
        stop_sequence: null,
        usage: { input_tokens: 5, output_tokens: 4 },
      },
    }),
  };
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-msg-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-msg-state-")) },
    providers: { fixture: ["claude-like"] }, providerAdapters: [adapter], providerTier: "execution", taskSignals: executionSignals,
  });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/messages`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture/claude-like", max_tokens: 32, messages: [{ role: "user", content: "classify A" }], tools: [{ name: "classify_fixture", input_schema: { type: "object" } }], costguardRoute: "must-not-leak" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ type: "message", model: "fixture/claude-like", stop_reason: "tool_use", content: [{ type: "tool_use", id: "toolu_1", name: "classify_fixture", input: { category: "A" } }], usage: { input_tokens: 5, output_tokens: 4 } });
  } finally {
    runtime.stop();
  }
});

test("Anthropic Messages E2E rejects an unknown tool_use_id before provider continuation", async () => {
  let calls = 0;
  const adapter: ProviderAdapter = {
    descriptor: { id: "fixture", models: ["claude-like"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["anthropic"] },
    invoke: async (request) => {
      calls += 1;
      return { status: "PRESENT", actualRuntimeModel: request.requestedModel, response: { type: "message", model: "claude-like", role: "assistant", content: [{ type: "text", text: "unexpected" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } } };
    },
  };
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-msg-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-msg-state-")) },
    providers: { fixture: ["claude-like"] }, providerAdapters: [adapter], providerTier: "execution", taskSignals: executionSignals,
  });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/messages`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture/claude-like", max_tokens: 32, messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "unknown-tool-use", content: "fixture result" }] }] }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ status: "UNKNOWN", failClosed: true, reason: "quality-tool-unknown-call-id" });
    expect(calls).toBe(0);
  } finally {
    runtime.stop();
  }
});

test("Anthropic Messages E2E rejects a transcript that omits a required tool result before provider continuation", async () => {
  let calls = 0;
  const adapter: ProviderAdapter = {
    descriptor: { id: "fixture", models: ["claude-like"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["anthropic"] },
    invoke: async (request) => {
      calls += 1;
      return { status: "PRESENT", actualRuntimeModel: request.requestedModel, response: { type: "message", model: "claude-like", role: "assistant", content: [], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } } };
    },
  };
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-msg-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-msg-state-")) },
    providers: { fixture: ["claude-like"] }, providerAdapters: [adapter], providerTier: "execution", taskSignals: executionSignals,
  });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/messages`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture/claude-like", max_tokens: 32, messages: [
        { role: "user", content: "classify A" },
        { role: "assistant", content: [{ type: "tool_use", id: "toolu_missing_result", name: "classify_fixture", input: {} }] },
      ] }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ status: "UNKNOWN", failClosed: true, reason: "quality-tool-result-required" });
    expect(calls).toBe(0);
  } finally {
    runtime.stop();
  }
});

test("Anthropic Messages E2E accepts a complete tool_use and tool_result continuation", async () => {
  let calls = 0;
  const adapter: ProviderAdapter = {
    descriptor: { id: "fixture", models: ["claude-like"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["anthropic"] },
    invoke: async (request) => { calls += 1; return { status: "PRESENT", actualRuntimeModel: request.requestedModel, response: { type: "message", model: "claude-like", role: "assistant", content: [{ type: "text", text: "completed after tool" }], stop_reason: "end_turn", usage: { input_tokens: 3, output_tokens: 2 } } }; },
  };
  const runtime = await startRuntime({ env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-msg-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-msg-state-")) }, providers: { fixture: ["claude-like"] }, providerAdapters: [adapter], providerTier: "execution", taskSignals: executionSignals });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "fixture/claude-like", max_tokens: 32, messages: [
      { role: "user", content: "classify A" },
      { role: "assistant", content: [{ type: "tool_use", id: "toolu_2", name: "classify_fixture", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_2", content: "A" }] },
    ] }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ content: [{ type: "text", text: "completed after tool" }], stop_reason: "end_turn", usage: { input_tokens: 3, output_tokens: 2 } });
    expect(calls).toBe(1);
  } finally { runtime.stop(); }
});

test("Anthropic Messages closes one two-request tool session through the same runtime", async () => {
  let calls = 0;
  const adapter: ProviderAdapter = {
    descriptor: { id: "fixture", models: ["claude-like"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["anthropic"] },
    invoke: async (request) => {
      calls += 1;
      const body = request.body as { messages?: unknown[] };
      expect(Object.keys(body).some((key) => key.toLowerCase().startsWith("costguard"))).toBe(false);
      if (calls === 1) {
        expect(body.messages).toHaveLength(1);
        return { status: "PRESENT", actualRuntimeModel: request.requestedModel, response: { id: "msg-session-step-1", type: "message", model: "claude-like", role: "assistant", content: [{ type: "tool_use", id: "toolu_session", name: "classify_fixture", input: { value: "A" } }], stop_reason: "tool_use", usage: { input_tokens: 4, output_tokens: 3 } } };
      }
      expect(body.messages).toHaveLength(3);
      return { status: "PRESENT", actualRuntimeModel: request.requestedModel, response: { id: "msg-session-step-2", type: "message", model: "claude-like", role: "assistant", content: [{ type: "text", text: "A" }], stop_reason: "end_turn", usage: { input_tokens: 7, output_tokens: 1 } } };
    },
  };
  const runtime = await startRuntime({ env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-msg-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-msg-state-")) }, providers: { fixture: ["claude-like"] }, providerAdapters: [adapter], providerTier: "execution", taskSignals: executionSignals });
  try {
    const first = await fetch(`${runtime.baseUrl}/v1/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "fixture/claude-like", max_tokens: 32, messages: [{ role: "user", content: "classify A" }], tools: [{ name: "classify_fixture", input_schema: { type: "object" } }], costguardTask: "must-not-leak" }) });
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    const second = await fetch(`${runtime.baseUrl}/v1/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "fixture/claude-like", max_tokens: 32, messages: [{ role: "user", content: "classify A" }, { role: "assistant", content: firstBody.content }, { role: "user", content: [{ type: "tool_result", tool_use_id: firstBody.content[0].id, content: "A" }] }] }) });
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ content: [{ type: "text", text: "A" }], stop_reason: "end_turn", usage: { input_tokens: 7, output_tokens: 1 } });
    expect(calls).toBe(2);
  } finally { runtime.stop(); }
});
