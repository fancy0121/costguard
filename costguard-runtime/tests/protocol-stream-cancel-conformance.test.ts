import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRuntime } from "../src/server/runtime";
import type { ProviderAdapter } from "../src/providers/registry";

const endpoints = {
  responses: { path: "/v1/responses", body: { model: "fixture/model", input: "extract fixture title", stream: true } },
  chat: { path: "/v1/chat/completions", body: { model: "fixture/model", messages: [{ role: "user", content: "extract fixture title" }], stream: true } },
  anthropic: { path: "/v1/messages", body: { model: "fixture/model", max_tokens: 32, messages: [{ role: "user", content: "extract fixture title" }], stream: true } },
} as const;

async function runtimeFor(protocol: "responses" | "chat" | "anthropic", adapter: ProviderAdapter) {
  return startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "costguard-protocol-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "costguard-protocol-state-")) },
    providers: { fixture: ["model"] }, providerAdapters: [adapter], providerTier: "execution",
    taskSignals: () => ({ text: "extract isolated fixture fields", isBatchOrRepetitive: true }),
  });
}

for (const protocol of ["responses", "chat", "anthropic"] as const) {
  test(`${protocol} stream E2E preserves streaming content type and terminal marker`, async () => {
    const terminal = protocol === "responses"
      ? 'event: response.completed\ndata: {"type":"response.completed"}\n\n'
      : protocol === "chat"
        ? 'data: [DONE]\n\n'
        : 'event: message_stop\ndata: {"type":"message_stop"}\n\n';
    const adapter: ProviderAdapter = {
      descriptor: { id: "fixture", models: ["model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: [protocol] },
      invoke: async () => ({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN" }),
      streamInvoke: async () => new Response(`event: delta\ndata: {"protocol":"${protocol}"}\n\n${terminal}`, { headers: { "content-type": "text/event-stream" } }),
    };
    const runtime = await runtimeFor(protocol, adapter);
    try {
      const endpoint = endpoints[protocol];
      const response = await fetch(runtime.baseUrl + endpoint.path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...endpoint.body, costguardTask: "do not leak" }) });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      expect(JSON.parse(response.headers.get("x-costguard-route-admission") ?? "{}") as { decidingTier?: string }).toEqual(expect.objectContaining({ decidingTier: "execution" }));
      const stream = await response.text();
      expect(stream).toContain(`"protocol":"${protocol}"`);
      expect(stream).toContain(protocol === "responses" ? "response.completed" : protocol === "chat" ? "[DONE]" : "message_stop");
      expect(stream).not.toContain('"reason":"stream-terminal-missing"');
      expect(stream).not.toContain("costguardTask");
    } finally { runtime.stop(); }
  });

  test(`${protocol} stream cancellation fails closed rather than emitting a completed response`, async () => {
    let observedAbort = false;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const adapter: ProviderAdapter = {
      descriptor: { id: "fixture", models: ["model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: [protocol] },
      invoke: async () => ({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN" }),
      streamInvoke: async (request) => {
        markStarted?.();
        request.signal.addEventListener("abort", () => { observedAbort = true; }, { once: true });
        await new Promise((resolve) => setTimeout(resolve, 40));
        return request.signal.aborted ? null : new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
      },
    };
    const runtime = await runtimeFor(protocol, adapter);
    try {
      const controller = new AbortController();
      const endpoint = endpoints[protocol];
      const pending = fetch(runtime.baseUrl + endpoint.path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(endpoint.body), signal: controller.signal });
      await started;
      controller.abort();
      await expect(pending).rejects.toBeTruthy();
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(observedAbort).toBe(true);
    } finally { runtime.stop(); }
  });

  test(`${protocol} stream that ends without a terminal emits a redacted error and never a synthetic completion`, async () => {
    const adapter: ProviderAdapter = {
      descriptor: { id: "fixture", models: ["model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: [protocol] },
      invoke: async () => ({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN" }),
      streamInvoke: async () => new Response(`event: delta\ndata: {"protocol":"${protocol}"}\n\n`, { headers: { "content-type": "text/event-stream" } }),
    };
    const runtime = await runtimeFor(protocol, adapter);
    try {
      const endpoint = endpoints[protocol];
      const response = await fetch(runtime.baseUrl + endpoint.path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(endpoint.body) });
      expect(response.status).toBe(200);
      const stream = await response.text();
      expect(stream).toContain('event: error\ndata: {"status":"UNKNOWN","failClosed":true,"reason":"stream-terminal-missing"}');
      expect(stream).not.toContain("[DONE]");
      expect(stream).not.toContain("response.completed");
    } finally { runtime.stop(); }
  });
}

test("Anthropic stream requires message_stop even after an end_turn delta", async () => {
  const adapter: ProviderAdapter = {
    descriptor: { id: "fixture", models: ["model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["anthropic"] },
    invoke: async () => ({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN" }),
    streamInvoke: async () => new Response([
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
    ].join(""), { headers: { "content-type": "text/event-stream" } }),
  };
  const runtime = await runtimeFor("anthropic", adapter);
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(endpoints.anthropic.body) });
    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain('"stop_reason":"end_turn"');
    expect(stream).toContain('event: error\ndata: {"status":"UNKNOWN","failClosed":true,"reason":"stream-terminal-missing"}');
    expect(stream).not.toContain("message_stop");
  } finally { runtime.stop(); }
});

test("Anthropic stream accepts explicit message_stop after a tool-use delta", async () => {
  const adapter: ProviderAdapter = {
    descriptor: { id: "fixture", models: ["model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["anthropic"] },
    invoke: async () => ({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN" }),
    streamInvoke: async () => new Response([
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].join(""), { headers: { "content-type": "text/event-stream" } }),
  };
  const runtime = await runtimeFor("anthropic", adapter);
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(endpoints.anthropic.body) });
    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain('event: message_stop');
    expect(stream).not.toContain('"reason":"stream-terminal-missing"');
  } finally { runtime.stop(); }
});

test("explicit structured quality contract refuses streaming before adapter dispatch", async () => {
  let streamCalls = 0;
  const adapter: ProviderAdapter = {
    descriptor: { id: "fixture", models: ["model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] },
    invoke: async () => ({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN" }),
    streamInvoke: async () => { streamCalls += 1; return new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } }); },
  };
  const runtime = await runtimeFor("responses", adapter);
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...endpoints.responses.body,
        text: { format: { type: "json_schema", json_schema: { schema: { type: "object", required: ["value"], properties: { value: { type: "string" } } } } } },
      }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ status: "UNKNOWN", failClosed: true, reason: "stream-quality-contract-unverified" });
    expect(streamCalls).toBe(0);
  } finally { runtime.stop(); }
});

test("Responses stream records an emitted function call for one strict tool-output continuation", async () => {
  let invokeCalls = 0;
  const adapter: ProviderAdapter = {
    descriptor: { id: "fixture", models: ["model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] },
    invoke: async (request) => {
      invokeCalls += 1;
      expect(request.body).toMatchObject({ previous_response_id: "rsp_stream_1" });
      return { status: "PRESENT", actualRuntimeModel: request.requestedModel, response: { output: [{ type: "message", content: [{ type: "output_text", text: "final" }] }] } };
    },
    streamInvoke: async () => new Response([
      'event: response.created\ndata: {"type":"response.created","response":{"id":"rsp_stream_1"}}\n\n',
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"call_stream_1","name":"fixture_tool","arguments":"{}"}}\n\n',
      'event: response.completed\ndata: {"type":"response.completed"}\n\n',
    ].join(""), { headers: { "content-type": "text/event-stream" } }),
  };
  const runtime = await runtimeFor("responses", adapter);
  try {
    const streamed = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture/model", input: "use fixture tool", stream: true }),
    });
    expect(streamed.status).toBe(200);
    await streamed.text();

    const continuation = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture/model", previous_response_id: "rsp_stream_1", input: [{ type: "function_call_output", call_id: "call_stream_1", output: "fixture" }] }),
    });
    expect(continuation.status).toBe(200);
    expect(invokeCalls).toBe(1);
  } finally { runtime.stop(); }
});

test("oversized stream inspection fails closed instead of retaining an unbounded transcript", async () => {
  const adapter: ProviderAdapter = {
    descriptor: { id: "fixture", models: ["model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] },
    invoke: async () => ({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN" }),
    streamInvoke: async () => new Response(`data: ${"x".repeat(262_145)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } }),
  };
  const runtime = await runtimeFor("responses", adapter);
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(endpoints.responses.body) });
    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain('event: error\ndata: {"status":"UNKNOWN","failClosed":true,"reason":"stream-inspection-limit-exceeded"}');
    expect(stream).not.toContain("response.completed");
  } finally { runtime.stop(); }
});
