import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRuntime } from "../src/server/runtime";
import type { ProviderAdapter } from "../src/providers/registry";

function executionSignals() {
  return { text: "rename each isolated fixture file", isToolOrFileExecution: true };
}

test("Chat Completions E2E preserves a native tool-call response instead of serializing it into text", async () => {
  const adapter: ProviderAdapter = {
    descriptor: { id: "fixture", models: ["chat-model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["chat"] },
    invoke: async (request) => ({
      status: "PRESENT",
      actualRuntimeModel: request.requestedModel,
      response: {
        id: "chat-native-tool-call",
        object: "chat.completion",
        model: "chat-model",
        choices: [{
          index: 0,
          message: { role: "assistant", content: null, tool_calls: [{ id: "call_chat_1", type: "function", function: { name: "rename_fixture", arguments: "{\"from\":\"a\",\"to\":\"b\"}" } }] },
          finish_reason: "tool_calls",
        }],
        usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
      },
    }),
  };
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-chat-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-chat-state-")) },
    providers: { fixture: ["chat-model"] }, providerAdapters: [adapter], providerTier: "execution", taskSignals: executionSignals,
  });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/chat/completions`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture/chat-model", messages: [{ role: "user", content: "rename a to b" }], tools: [{ type: "function", function: { name: "rename_fixture" } }], costguardTask: "must not leak" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ object: "chat.completion", model: "fixture/chat-model", choices: [{ message: { tool_calls: [{ id: "call_chat_1", function: { name: "rename_fixture" } }] }, finish_reason: "tool_calls" }], usage: { total_tokens: 7 } });
    expect(body.choices[0].message.content).toBeNull();
  } finally {
    runtime.stop();
  }
});

test("Chat Completions E2E rejects an unknown tool_call_id before provider continuation", async () => {
  let calls = 0;
  const adapter: ProviderAdapter = {
    descriptor: { id: "fixture", models: ["chat-model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["chat"] },
    invoke: async (request) => {
      calls += 1;
      return { status: "PRESENT", actualRuntimeModel: request.requestedModel, response: { object: "chat.completion", model: "chat-model", choices: [{ index: 0, message: { role: "assistant", content: "unexpected" }, finish_reason: "stop" }] } };
    },
  };
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-chat-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-chat-state-")) },
    providers: { fixture: ["chat-model"] }, providerAdapters: [adapter], providerTier: "execution", taskSignals: executionSignals,
  });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/chat/completions`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture/chat-model", messages: [{ role: "tool", tool_call_id: "unknown-call", content: "fixture result" }] }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ status: "UNKNOWN", failClosed: true, reason: "quality-tool-unknown-call-id" });
    expect(calls).toBe(0);
  } finally {
    runtime.stop();
  }
});

test("Chat Completions E2E rejects a transcript that omits a required tool result before provider continuation", async () => {
  let calls = 0;
  const adapter: ProviderAdapter = {
    descriptor: { id: "fixture", models: ["chat-model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["chat"] },
    invoke: async (request) => {
      calls += 1;
      return { status: "PRESENT", actualRuntimeModel: request.requestedModel, response: { object: "chat.completion", model: "chat-model", choices: [] } };
    },
  };
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-chat-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-chat-state-")) },
    providers: { fixture: ["chat-model"] }, providerAdapters: [adapter], providerTier: "execution", taskSignals: executionSignals,
  });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/chat/completions`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture/chat-model", messages: [
        { role: "user", content: "rename a to b" },
        { role: "assistant", content: null, tool_calls: [{ id: "call_missing_result", type: "function", function: { name: "rename_fixture", arguments: "{}" } }] },
      ] }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ status: "UNKNOWN", failClosed: true, reason: "quality-tool-result-required" });
    expect(calls).toBe(0);
  } finally {
    runtime.stop();
  }
});

test("Chat Completions E2E accepts a complete assistant tool-call and tool-result continuation", async () => {
  let calls = 0;
  const adapter: ProviderAdapter = {
    descriptor: { id: "fixture", models: ["chat-model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["chat"] },
    invoke: async (request) => {
      calls += 1;
      return { status: "PRESENT", actualRuntimeModel: request.requestedModel, response: { object: "chat.completion", model: "chat-model", choices: [{ index: 0, message: { role: "assistant", content: "completed after tool" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } } };
    },
  };
  const runtime = await startRuntime({ env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-chat-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-chat-state-")) }, providers: { fixture: ["chat-model"] }, providerAdapters: [adapter], providerTier: "execution", taskSignals: executionSignals });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "fixture/chat-model", messages: [
      { role: "user", content: "rename a to b" },
      { role: "assistant", content: null, tool_calls: [{ id: "call_chat_2", type: "function", function: { name: "rename_fixture", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "call_chat_2", content: "renamed" },
    ] }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ choices: [{ message: { content: "completed after tool" }, finish_reason: "stop" }], usage: { total_tokens: 5 } });
    expect(calls).toBe(1);
  } finally { runtime.stop(); }
});

test("Chat Completions closes one two-request tool session through the same runtime", async () => {
  let calls = 0;
  const adapter: ProviderAdapter = {
    descriptor: { id: "fixture", models: ["chat-model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["chat"] },
    invoke: async (request) => {
      calls += 1;
      const body = request.body as { messages?: unknown[] };
      expect(Object.keys(body).some((key) => key.toLowerCase().startsWith("costguard"))).toBe(false);
      if (calls === 1) {
        expect(body.messages).toHaveLength(1);
        return {
          status: "PRESENT",
          actualRuntimeModel: request.requestedModel,
          response: {
            id: "chat-session-step-1",
            object: "chat.completion",
            model: "chat-model",
            choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: [{ id: "call_chat_session", type: "function", function: { name: "rename_fixture", arguments: "{\"from\":\"a\",\"to\":\"b\"}" } }] }, finish_reason: "tool_calls" }],
          },
        };
      }
      expect(body.messages).toHaveLength(3);
      return {
        status: "PRESENT",
        actualRuntimeModel: request.requestedModel,
        response: { id: "chat-session-step-2", object: "chat.completion", model: "chat-model", choices: [{ index: 0, message: { role: "assistant", content: "renamed" }, finish_reason: "stop" }], usage: { prompt_tokens: 6, completion_tokens: 1, total_tokens: 7 } },
      };
    },
  };
  const runtime = await startRuntime({ env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-chat-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-chat-state-")) }, providers: { fixture: ["chat-model"] }, providerAdapters: [adapter], providerTier: "execution", taskSignals: executionSignals });
  try {
    const first = await fetch(`${runtime.baseUrl}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "fixture/chat-model", messages: [{ role: "user", content: "rename a to b" }], tools: [{ type: "function", function: { name: "rename_fixture" } }], costguardTask: "must-not-leak" }) });
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    const assistant = firstBody.choices[0].message;
    const second = await fetch(`${runtime.baseUrl}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "fixture/chat-model", messages: [{ role: "user", content: "rename a to b" }, assistant, { role: "tool", tool_call_id: assistant.tool_calls[0].id, content: "renamed" }] }) });
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ choices: [{ message: { content: "renamed" }, finish_reason: "stop" }], usage: { total_tokens: 7 } });
    expect(calls).toBe(2);
  } finally { runtime.stop(); }
});
