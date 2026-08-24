import { describe, expect, test } from "bun:test";
import { startRuntime } from "../src/server/runtime";
import type { ProviderAdapter } from "../src/providers/registry";
import { selectSidecar } from "../src/sidecars/capabilities";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("SSE streaming E2E", () => {
  test("stream:true returns text/event-stream with [DONE]", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "sse-"));
    const saveTokenHome = await mkdtemp(join(tmpdir(), "sse-"));
    const adapter: ProviderAdapter = {
      descriptor: { id: "test", models: ["x"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] },
      invoke: async () => ({ status: "PRESENT", actualRuntimeModel: "test/x", response: { model: "x" } }),
      streamInvoke: async () => new Response("event: test\ndata: ok\n\ndata: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } }),
    };
    const runtime = await startRuntime({
      env: { CODEX_HOME: codexHome, SAVETOKEN_HOME: saveTokenHome },
      providers: { test: ["x"] },
      providerAdapters: [adapter],
      providerTier: "execution",
      taskSignals: () => ({ text: "extract format text classify json data convert sort filter batch", isBatchOrRepetitive: true, isToolOrFileExecution: true }),
    });
    try {
      const res = await fetch(runtime.baseUrl + "/v1/responses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "test/x", input: "hi", stream: true }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      const text = await res.text();
      expect(text).toContain("[DONE]");
      expect(text).toContain("event: test");
    } finally { runtime.stop(); }
  });

  test("stream without streamInvoke fails closed 422", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "sse2-"));
    const saveTokenHome = await mkdtemp(join(tmpdir(), "sse2-"));
    const adapter: ProviderAdapter = {
      descriptor: { id: "test2", models: ["y"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] },
      invoke: async () => ({ status: "PRESENT", actualRuntimeModel: "test2/y", response: { model: "y", output: [{ type: "message", content: [{ type: "output_text", text: "hi" }] }] } }),
      // No streamInvoke
    };
    const runtime = await startRuntime({
      env: { CODEX_HOME: codexHome, SAVETOKEN_HOME: saveTokenHome },
      providers: { test2: ["y"] },
      providerAdapters: [adapter],
      providerTier: "execution",
      taskSignals: () => ({ text: "extract format text classify json data convert sort filter batch process", isBatchOrRepetitive: true, isToolOrFileExecution: true }),
    });
    try {
      const res = await fetch(runtime.baseUrl + "/v1/responses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "test2/y", input: "hi", stream: true }),
      });
      // Without streamInvoke, must fail closed — no fake streaming
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.failClosed).toBe(true);
    } finally { runtime.stop(); }
  });
});

describe("Sidecar facade", () => {
  test("selectSidecar fails closed when no config", () => {
    const result = selectSidecar("web-search", true, new Set([]));
    expect(result.status).toBe("UNKNOWN");
  });

  test("selectSidecar fails closed for unknown capability", () => {
    const result = selectSidecar("vision" as any, true, new Set(["web-search"]));
    expect(result.status).toBe("UNKNOWN");
  });

  test("WebSocket admission fails closed without capability", async () => {
    // WebSocket test is covered by existing websocket-stage3.test.ts
    // This verifies the behavior contract
    const codexHome = await mkdtemp(join(tmpdir(), "ws-"));
    const saveTokenHome = await mkdtemp(join(tmpdir(), "ws-"));
    const runtime = await startRuntime({
      env: { CODEX_HOME: codexHome, SAVETOKEN_HOME: saveTokenHome },
      providers: { test: ["x"] },
      taskSignals: () => ({ text: "extract format text classify json data convert sort filter batch process long", isBatchOrRepetitive: true, isToolOrFileExecution: true }),
    });
    try {
      // WebSocket upgrade without websocket capability should fail
      const res = await fetch(runtime.baseUrl + "/ws", {
        headers: { "upgrade": "websocket", "connection": "upgrade" },
      });
      // Should return error since websocket is not configured
      expect(res.status).toBeGreaterThanOrEqual(400);
    } finally { runtime.stop(); }
  });
});
