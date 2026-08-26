import { describe, expect, test } from "bun:test";
import { createOpenCodexProxyAdapter, createOpenCodexProxyAdapters, parseOpenAiResponsesSse } from "../src/providers/opencodex-proxy";

describe("OpenCodex proxy adapter", () => {
  test("aggregates OpenAI response text deltas when completed event does not include output", () => {
    const parsed = parseOpenAiResponsesSse([
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"beta"}\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"model":"gpt-5.6-luna","usage":{"input_tokens":2,"output_tokens":1,"total_tokens":3}}}\n',
      'data: [DONE]\n',
    ].join("\n"));
    expect(parsed).toEqual({ model: "gpt-5.6-luna", usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 }, output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "beta" }] }] });
  });

  test("aggregates OpenAI output_text.done events and completed output items", () => {
    const parsed = parseOpenAiResponsesSse([
      'event: response.output_text.done\ndata: {"type":"response.output_text.done","text":"beta"}\n',
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"beta"}]}}\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"model":"gpt-5.6-luna"}}\n',
    ].join("\n"));
    expect(parsed).toEqual({ model: "gpt-5.6-luna", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "beta" }] }] });
  });

  test("does not let an empty completed output erase aggregated response text", () => {
    const parsed = parseOpenAiResponsesSse([
      'event: response.output_text.done\ndata: {"type":"response.output_text.done","text":"beta"}\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"model":"gpt-5.6-luna","output":[]}}\n',
    ].join("\n"));
    expect(parsed.output).toEqual([{ type: "message", role: "assistant", content: [{ type: "output_text", text: "beta" }] }]);
  });
  test("proxy auth mode and descriptor are correct", () => {
    const adapter = createOpenCodexProxyAdapter({ baseUrl: "http://127.0.0.1:9999" });
    expect(adapter.descriptor.auth).toBe("proxy");
    expect(adapter.descriptor.id).toBe("deepseek");
    expect(adapter.descriptor.models).toEqual(["deepseek-v4-flash"]);
    expect(adapter.descriptor.tier).toBe("execution");
    expect(adapter.descriptor.capabilities).toContain("responses");
    expect(adapter.descriptor.health).toBe("healthy");
  });

  test("preserves a frozen tier for each model when one proxy provider owns several routes", () => {
    const openai = createOpenCodexProxyAdapters({ baseUrl: "http://127.0.0.1:10100" }).find((adapter) => adapter.descriptor.id === "openai")!;
    expect(openai.descriptor.modelTiers).toEqual({
      "gpt-5.6-sol": "sol",
      "gpt-5.6-terra": "terra",
      "gpt-5.6-luna": "execution",
    });
  });

  test("rejects non-loopback base URLs", () => {
    expect(() => createOpenCodexProxyAdapter({ baseUrl: "http://example.com:8080" })).toThrow("opencodex-proxy-loopback-only");
    expect(() => createOpenCodexProxyAdapter({ baseUrl: "http://192.168.1.1:10100" })).toThrow("opencodex-proxy-loopback-only");
  });

  test("accepts loopback URLs", () => {
    expect(() => createOpenCodexProxyAdapter({ baseUrl: "http://127.0.0.1:10100" })).not.toThrow();
    expect(() => createOpenCodexProxyAdapter({ baseUrl: "http://localhost:10100" })).not.toThrow();
    expect(() => createOpenCodexProxyAdapter({ baseUrl: "http://[::1]:10100" })).not.toThrow();
  });

  test("rejects invalid URLs", () => {
    expect(() => createOpenCodexProxyAdapter({ baseUrl: "not-a-url" })).toThrow("opencodex-proxy-base-url-invalid");
  });

  test("rejects a loopback base URL that could alter a fixed native protocol path", () => {
    expect(() => createOpenCodexProxyAdapter({ baseUrl: "http://127.0.0.1:10100/private" })).toThrow("opencodex-proxy-base-url-shape-invalid");
    expect(() => createOpenCodexProxyAdapter({ baseUrl: "http://user@127.0.0.1:10100" })).toThrow("opencodex-proxy-base-url-shape-invalid");
    expect(() => createOpenCodexProxyAdapter({ baseUrl: "http://127.0.0.1:10100?redirect=1" })).toThrow("opencodex-proxy-base-url-shape-invalid");
    expect(() => createOpenCodexProxyAdapter({ baseUrl: "http://127.0.0.1:10100#fragment" })).toThrow("opencodex-proxy-base-url-shape-invalid");
  });

  test("rejects invalid paths", () => {
    expect(() => createOpenCodexProxyAdapter({ baseUrl: "http://127.0.0.1:10100", path: "v1/responses" })).toThrow("opencodex-proxy-path-invalid");
    expect(() => createOpenCodexProxyAdapter({ baseUrl: "http://127.0.0.1:10100", path: "/admin" })).toThrow("opencodex-proxy-path-invalid");
  });

  test("rejects body with costguard fields (pureBody enforcement)", async () => {
    const adapter = createOpenCodexProxyAdapter({ baseUrl: "http://127.0.0.1:9999" });
    const result = await adapter.invoke({
      requestedModel: "deepseek/deepseek-v4-flash",
      protocol: "responses",
      signal: new AbortController().signal,
      body: { model: "deepseek/deepseek-v4-flash", input: "hello", costguardTask: "test" },
    });
    expect(result.status).toBe("UNKNOWN");
    expect(result.reason).toBe("proxy-purebody-required");
  });

  test("rejects future CostGuard-prefixed fields before proxy forwarding", async () => {
    const adapter = createOpenCodexProxyAdapter({ baseUrl: "http://127.0.0.1:9999" });
    const result = await adapter.invoke({
      requestedModel: "deepseek/deepseek-v4-flash",
      protocol: "responses",
      signal: new AbortController().signal,
      body: { model: "deepseek/deepseek-v4-flash", input: "hello", costguardFutureFlag: true },
    });
    expect(result.status).toBe("UNKNOWN");
    expect(result.reason).toBe("proxy-purebody-required");
  });

  test("returns cancelled when signal already aborted", async () => {
    const adapter = createOpenCodexProxyAdapter({ baseUrl: "http://127.0.0.1:9999" });
    const controller = new AbortController();
    controller.abort();
    const result = await adapter.invoke({
      requestedModel: "deepseek/deepseek-v4-flash",
      protocol: "responses",
      signal: controller.signal,
      body: { model: "deepseek/deepseek-v4-flash", input: "hello" },
    });
    expect(result.status).toBe("cancelled");
  });

  test("fails closed when proxy is unreachable", async () => {
    const adapter = createOpenCodexProxyAdapter({ baseUrl: "http://127.0.0.1:65432", timeoutMs: 500 });
    const result = await adapter.invoke({
      requestedModel: "deepseek/deepseek-v4-flash",
      protocol: "responses",
      signal: new AbortController().signal,
      body: { model: "deepseek/deepseek-v4-flash", input: "hello" },
    });
    expect(result.status).toBe("UNKNOWN");
    expect(result.reason).toBe("proxy-request-failed");
  });

  test("fails closed with a stable reason when the bounded proxy request times out", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1", port: 0,
      fetch: async () => { await new Promise((resolve) => setTimeout(resolve, 80)); return Response.json({ model: "deepseek-v4-flash" }); },
    });
    try {
      const adapter = createOpenCodexProxyAdapter({ baseUrl: server.url.toString().replace(/\/$/, ""), timeoutMs: 10 });
      const result = await adapter.invoke({ requestedModel: "deepseek/deepseek-v4-flash", protocol: "responses", signal: new AbortController().signal, body: { model: "deepseek-v4-flash", input: "fixture" } });
      expect(result).toEqual({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "proxy-request-timeout" });
    } finally { server.stop(); }
  });

  test("rejects non-object body", async () => {
    const adapter = createOpenCodexProxyAdapter({ baseUrl: "http://127.0.0.1:9999" });
    const result = await adapter.invoke({
      requestedModel: "deepseek/deepseek-v4-flash",
      protocol: "responses",
      signal: new AbortController().signal,
      body: "not-an-object" as unknown as Record<string, unknown>,
    });
    expect(result.status).toBe("UNKNOWN");
    expect(result.reason).toBe("proxy-body-invalid");
  });

  test("maps proxy HTTP failures to stable redacted provider reasons", async () => {
    for (const [status, reason] of [[401, "provider-auth-failed"], [403, "provider-forbidden"], [429, "provider-rate-limited"], [500, "provider-request-failed"], [503, "provider-unavailable"]] as const) {
      const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("untrusted upstream detail", { status }) });
      try {
        const adapter = createOpenCodexProxyAdapter({ baseUrl: server.url.toString().replace(/\/$/, "") });
        const result = await adapter.invoke({ requestedModel: "deepseek/deepseek-v4-flash", protocol: "responses", signal: new AbortController().signal, body: { model: "deepseek-v4-flash", input: "fixture" } });
        expect(result).toEqual({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason });
        expect(JSON.stringify(result)).not.toContain("untrusted upstream detail");
      } finally { server.stop(); }
    }
  });

  test("uses fixed native protocol paths and does not apply Responses-only body rewriting to Chat or Anthropic", async () => {
    const observed: Array<{ path: string; body: Record<string, unknown> }> = [];
    const server = Bun.serve({
      hostname: "127.0.0.1", port: 0,
      async fetch(request) {
        observed.push({ path: new URL(request.url).pathname, body: await request.json() as Record<string, unknown> });
        return Response.json({ model: "gpt-5.6-luna", object: "chat.completion", choices: [] });
      },
    });
    try {
      const adapter = createOpenCodexProxyAdapters({ baseUrl: server.url.toString().replace(/\/$/, "") }).find((item) => item.descriptor.id === "openai");
      if (!adapter) throw new Error("adapter-missing");
      expect((await adapter.invoke({ requestedModel: "openai/gpt-5.6-luna", protocol: "chat", signal: new AbortController().signal, body: { model: "gpt-5.6-luna", messages: [{ role: "user", content: "hello" }] } })).status).toBe("PRESENT");
      expect((await adapter.invoke({ requestedModel: "openai/gpt-5.6-luna", protocol: "anthropic", signal: new AbortController().signal, body: { model: "gpt-5.6-luna", max_tokens: 8, messages: [{ role: "user", content: "hello" }] } })).status).toBe("PRESENT");
      expect(observed).toEqual([
        { path: "/v1/chat/completions", body: { model: "gpt-5.6-luna", messages: [{ role: "user", content: "hello" }] } },
        { path: "/v1/messages", body: { model: "gpt-5.6-luna", max_tokens: 8, messages: [{ role: "user", content: "hello" }] } },
      ]);
    } finally { server.stop(); }
  });
});
