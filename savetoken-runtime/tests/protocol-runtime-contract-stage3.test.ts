import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRuntime } from "../src/server/runtime";
import type { ProviderAdapter } from "../src/providers/registry";

const signals = () => ({
  text: "extract the title and date from each markdown file",
  isBatchOrRepetitive: true,
  isToolOrFileExecution: true,
});

async function runtimeFor(
  protocol: "responses" | "chat" | "anthropic",
  response: unknown,
  observed: string[],
  observedBodies: unknown[] = [],
) {
  const adapter: ProviderAdapter = {
    descriptor: {
      id: "fixture",
      models: ["model-a"],
      auth: "fixture",
      health: "healthy",
      tier: "execution",
      capabilities: [protocol],
    },
    invoke: async ({ protocol: receivedProtocol, requestedModel, ...request }) => {
      observed.push(`${receivedProtocol}:${requestedModel}`);
      observedBodies.push(request.body);
      return {
        status: "PRESENT",
        actualRuntimeModel: requestedModel,
        response,
      } as any;
    },
  };
  return startRuntime({
    env: {
      CODEX_HOME: await mkdtemp(join(tmpdir(), "savetoken-codex-")),
      SAVETOKEN_HOME: await mkdtemp(join(tmpdir(), "savetoken-state-")),
    },
    providers: { fixture: ["model-a"] },
    providerTier: "execution",
    taskSignals: signals,
    providerAdapters: [adapter],
  });
}

test("dispatch strips SaveToken control fields before invoking the provider", async () => {
  const observedBodies: unknown[] = [];
  const runtime = await runtimeFor("responses", [], [], observedBodies);
  try {
    const result = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "fixture/model-a",
        input: [{ role: "user", content: "hello" }],
        savetokenTask: "classify this request",
        savetokenTier: "execution",
        savetokenRoute: "fixture/model-a",
      }),
    });
    expect(result.status).toBe(200);
    expect(observedBodies).toEqual([{
      model: "fixture/model-a",
      input: [{ role: "user", content: "hello" }],
    }]);
  } finally {
    runtime.stop();
  }
});

test("dispatch strips every top-level savetoken-prefixed field before invoking the provider", async () => {
  const observedBodies: unknown[] = [];
  const runtime = await runtimeFor("responses", [], [], observedBodies);
  try {
    const result = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture/model-a", input: "hello", savetokenTask: "hidden", savetokenPrivateDiagnostic: "internal-only", savetokenFutureFlag: true }),
    });
    expect(result.status).toBe(200);
    expect(observedBodies).toEqual([{ model: "fixture/model-a", input: "hello" }]);
  } finally { runtime.stop(); }
});

test("Responses contract returns a protocol-native response and preserves tools", async () => {
  const observed: string[] = [];
  const observedBodies: unknown[] = [];
  const runtime = await runtimeFor("responses", {
    id: "resp_fixture",
    object: "response",
    status: "completed",
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }],
  }, observed, observedBodies);
  try {
    const result = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "fixture/model-a",
        input: [{ role: "user", content: "hello" }],
        tools: [{ type: "function", name: "lookup" }],
      }),
    });
    expect(result.status).toBe(200);
    const routeAdmission = result.headers.get("x-savetoken-route-admission");
    expect(routeAdmission).not.toBeNull();
    expect(JSON.parse(routeAdmission!)).toMatchObject({ decidingTier: "execution", signalSource: "structured" });
    expect(await result.json()).toMatchObject({ object: "response", status: "completed", model: "fixture/model-a" });
    expect(observed).toEqual(["responses:fixture/model-a"]);
    expect(observedBodies).toEqual([{
      model: "fixture/model-a",
      input: [{ role: "user", content: "hello" }],
      tools: [{ type: "function", name: "lookup" }],
    }]);
  } finally {
    runtime.stop();
  }
});

test("Responses contract returns 422 with route admission when an explicit JSON schema rejects the provider output", async () => {
  const runtime = await runtimeFor("responses", { output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "not-json" }] }] }, []);
  try {
    const result = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "fixture/model-a",
        input: "return JSON",
        text: {
          format: {
            type: "json_schema",
            json_schema: {
              schema: { type: "object", required: ["value"], properties: { value: { type: "string" } } },
            },
          },
        },
      }),
    });
    expect(result.status).toBe(422);
    expect(await result.json()).toMatchObject({ status: "UNKNOWN", failClosed: true, routeAdmission: { decidingTier: "execution" } });
  } finally { runtime.stop(); }
});

test("Responses contract fails closed with route admission for an unsupported explicit schema", async () => {
  const runtime = await runtimeFor("responses", { output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: '"fixture"' }] }] }, []);
  try {
    const result = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "fixture/model-a", input: "return a bounded string",
        text: { format: { type: "json_schema", json_schema: { schema: { type: "string", pattern: ".*" } } } },
      }),
    });
    expect(result.status).toBe(422);
    expect(await result.json()).toMatchObject({ status: "UNKNOWN", failClosed: true, reason: "quality-schema-unsupported at $", routeAdmission: { decidingTier: "execution" } });
  } finally { runtime.stop(); }
});

test("Responses contract fails closed when an explicit schema is malformed", async () => {
  const runtime = await runtimeFor("responses", { output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: '{"value":"fixture"}' }] }] }, []);
  try {
    const result = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture/model-a", input: "return JSON", text: { format: { type: "json_schema", schema: "{" } } }),
    });
    expect(result.status).toBe(422);
    expect(await result.json()).toMatchObject({ status: "UNKNOWN", failClosed: true, reason: "quality-schema-invalid", routeAdmission: { decidingTier: "execution" } });
  } finally { runtime.stop(); }
});

test("Chat Completions contract returns a protocol-native response", async () => {
  const observed: string[] = [];
  const observedBodies: unknown[] = [];
  const runtime = await runtimeFor("chat", {
    id: "chat_fixture",
    object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
  }, observed, observedBodies);
  try {
    const result = await fetch(`${runtime.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture/model-a", messages: [{ role: "user", content: "hello" }] }),
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ object: "chat.completion", model: "fixture/model-a", choices: [{ message: { role: "assistant" } }] });
    expect(observed).toEqual(["chat:fixture/model-a"]);
    expect(observedBodies).toEqual([{ model: "fixture/model-a", messages: [{ role: "user", content: "hello" }] }]);
  } finally {
    runtime.stop();
  }
});

test("Anthropic Messages contract returns a protocol-native response", async () => {
  const observed: string[] = [];
  const observedBodies: unknown[] = [];
  const runtime = await runtimeFor("anthropic", {
    id: "msg_fixture",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: "ok" }],
    stop_reason: "end_turn",
  }, observed, observedBodies);
  try {
    const result = await fetch(`${runtime.baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "fixture/model-a",
        max_tokens: 32,
        messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
      }),
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ type: "message", id: "msg_fixture", model: "fixture/model-a", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });
    expect(observed).toEqual(["anthropic:fixture/model-a"]);
    expect(observedBodies).toEqual([{
      model: "fixture/model-a",
      max_tokens: 32,
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    }]);
  } finally {
    runtime.stop();
  }
});

test("Chat JSON schema quality contract validates a protocol-native assistant response", async () => {
  const runtime = await runtimeFor("chat", {
    object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content: '{"value":"fixture"}' }, finish_reason: "stop" }],
  }, []);
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/chat/completions`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "fixture/model-a", messages: [{ role: "user", content: "return JSON" }],
        response_format: { type: "json_schema", json_schema: { schema: { type: "object", required: ["value"], properties: { value: { type: "string" } } } } },
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ object: "chat.completion", choices: [{ message: { content: '{"value":"fixture"}' } }] });
  } finally { runtime.stop(); }
});

test("Anthropic JSON schema quality contract validates a protocol-native text response", async () => {
  const runtime = await runtimeFor("anthropic", {
    type: "message", role: "assistant", content: [{ type: "text", text: '{"value":"fixture"}' }], stop_reason: "end_turn",
  }, []);
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/messages`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "fixture/model-a", max_tokens: 32, messages: [{ role: "user", content: "return JSON" }],
        response_format: { type: "json_schema", json_schema: { schema: { type: "object", required: ["value"], properties: { value: { type: "string" } } } } },
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ type: "message", content: [{ type: "text", text: '{"value":"fixture"}' }] });
  } finally { runtime.stop(); }
});

test("Chat function schema quality contract rejects mismatched native tool arguments with route admission", async () => {
  const runtime = await runtimeFor("chat", {
    object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: [{ id: "call_fixture", type: "function", function: { name: "lookup", arguments: '{"id":7}' } }] }, finish_reason: "tool_calls" }],
  }, []);
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/chat/completions`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "fixture/model-a", messages: [{ role: "user", content: "use tool" }],
        tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } }],
      }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ status: "UNKNOWN", failClosed: true, routeAdmission: { decidingTier: "execution" } });
  } finally { runtime.stop(); }
});

test("Anthropic tool schema quality contract accepts matching native tool_use input", async () => {
  const runtime = await runtimeFor("anthropic", {
    type: "message", role: "assistant", content: [{ type: "tool_use", id: "toolu_fixture", name: "lookup", input: { id: "fixture" } }], stop_reason: "tool_use",
  }, []);
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/messages`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "fixture/model-a", max_tokens: 32, messages: [{ role: "user", content: "use tool" }],
        tools: [{ name: "lookup", input_schema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } }],
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ type: "message", stop_reason: "tool_use", content: [{ type: "tool_use", name: "lookup", input: { id: "fixture" } }] });
  } finally { runtime.stop(); }
});

test("Chat multi-tool quality contract validates the matching non-first native tool schema", async () => {
  const runtime = await runtimeFor("chat", {
    object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: [{ id: "call_fixture", type: "function", function: { name: "lookup_by_id", arguments: '{"id":"fixture"}' } }] }, finish_reason: "tool_calls" }],
  }, []);
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/chat/completions`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "fixture/model-a", messages: [{ role: "user", content: "use tool" }],
        tools: [
          { type: "function", function: { name: "lookup_by_name", parameters: { type: "object", required: ["name"], properties: { name: { type: "string" } } } } },
          { type: "function", function: { name: "lookup_by_id", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
        ],
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ object: "chat.completion", choices: [{ message: { tool_calls: [{ function: { name: "lookup_by_id", arguments: '{"id":"fixture"}' } }] } }] });
  } finally { runtime.stop(); }
});

test("explicit non-object JSON schema fails closed before Chat provider dispatch", async () => {
  const observed: string[] = [];
  const runtime = await runtimeFor("chat", { object: "chat.completion", choices: [] }, observed);
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/chat/completions`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "fixture/model-a", messages: [{ role: "user", content: "return JSON" }],
        response_format: { type: "json_schema", json_schema: { schema: null } },
      }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ status: "UNKNOWN", failClosed: true, reason: "quality-schema-invalid" });
    expect(observed).toEqual([]);
  } finally { runtime.stop(); }
});
