import { describe, expect, test } from "bun:test";
import { startRuntime } from "../src/server/runtime";
import type { ProviderAdapter } from "../src/providers/registry";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TOOL = { type: "function", name: "echo", parameters: { type: "object", properties: { value: { type: "string" } }, required: ["value"] } };

function trackedAdapter(): ProviderAdapter & { calls: number } {
  const a = {
    calls: 0,
    descriptor: { id: "t", models: ["x"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] },
    invoke: async () => {
      a.calls++;
      if (a.calls === 1) {
        return { status: "PRESENT", actualRuntimeModel: "t/x", response: { id: "prov-resp-1", model: "x", output: [{ type: "function_call", name: "echo", arguments: '{"value":"hi"}', call_id: "call-1", status: "completed" }] } };
      }
      return { status: "PRESENT", actualRuntimeModel: "t/x", response: { id: "prov-resp-2", model: "x", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "done" }] }] } };
    },
  } as any;
  return a;
}

async function makeRuntime() {
  const codexHome = await mkdtemp(join(tmpdir(), "mt-"));
  const saveTokenHome = await mkdtemp(join(tmpdir(), "mt-"));
  const adapter = trackedAdapter();
  const runtime = await startRuntime({
    env: { CODEX_HOME: codexHome, SAVETOKEN_HOME: saveTokenHome },
    providers: { t: ["x"] }, providerAdapters: [adapter], providerTier: "execution",
    taskSignals: () => ({ text: "extract format classify json tool call data convert sort filter batch long text", isBatchOrRepetitive: true, isToolOrFileExecution: true }),
  });
  return { runtime, adapter };
}

describe("Multi-turn strict validation", () => {
  test("missing call_id in tool result rejects before provider", async () => {
    const { runtime, adapter } = await makeRuntime();
    try {
      const initial = await fetch(runtime.baseUrl + "/v1/responses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "t/x", input: "hi", tools: [TOOL] }),
      });
      expect(initial.status).toBe(200);
      const firstBody = await initial.json();
      const r = await fetch(runtime.baseUrl + "/v1/responses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "t/x", previous_response_id: firstBody.id, input: [{ type: "function_call_output", output: "x" }] }),
      });
      expect(r.status).toBe(422);
      expect(await r.json()).toMatchObject({ status: "UNKNOWN", failClosed: true, reason: "quality-tool-missing-call-id" });
      expect(adapter.calls).toBe(1);
    } finally { runtime.stop(); }
  });

  test("unknown call_id rejects", async () => {
    const { runtime } = await makeRuntime();
    try {
      const r0 = await fetch(runtime.baseUrl + "/v1/responses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "t/x", input: "hi", tools: [TOOL] }),
      });
      expect(r0.status).toBe(200);
      const j0 = await r0.json();
      const r = await fetch(runtime.baseUrl + "/v1/responses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "t/x", previous_response_id: j0.id, input: [{ type: "function_call_output", call_id: "bogus-call", output: "x" }] }),
      });
      expect(r.status).toBe(422);
    } finally { runtime.stop(); }
  });

  test("duplicate tool result rejects", async () => {
    const { runtime } = await makeRuntime();
    try {
      const r0 = await fetch(runtime.baseUrl + "/v1/responses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "t/x", input: "hi", tools: [TOOL] }),
      });
      const j0 = await r0.json();
      const fc = j0.output?.find((o: any) => o.type === "function_call");
      const first = await fetch(runtime.baseUrl + "/v1/responses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "t/x", previous_response_id: j0.id, input: [{ type: "function_call_output", call_id: fc.call_id, output: "ok" }] }),
      });
      expect(first.status).toBe(200);
      const second = await fetch(runtime.baseUrl + "/v1/responses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "t/x", previous_response_id: j0.id, input: [{ type: "function_call_output", call_id: fc.call_id, output: "again" }] }),
      });
      expect(second.status).toBe(422);
    } finally { runtime.stop(); }
  });

  test("tool result with a mismatched explicit name rejects before provider continuation", async () => {
    const { runtime, adapter } = await makeRuntime();
    try {
      const initial = await fetch(runtime.baseUrl + "/v1/responses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "t/x", input: "hi", tools: [TOOL] }),
      });
      expect(initial.status).toBe(200);
      const firstBody = await initial.json();
      const functionCall = firstBody.output?.find((item: any) => item.type === "function_call");
      expect(functionCall?.name).toBe("echo");

      const continuation = await fetch(runtime.baseUrl + "/v1/responses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "t/x",
          previous_response_id: firstBody.id,
          input: [{ type: "function_call_output", call_id: functionCall.call_id, name: "different_tool", output: "ok" }],
        }),
      });

      expect(continuation.status).toBe(422);
      expect(await continuation.json()).toMatchObject({ status: "UNKNOWN", failClosed: true, reason: "quality-tool-name-mismatch" });
      expect(adapter.calls).toBe(1);
    } finally { runtime.stop(); }
  });

  test("valid multi-turn completes final answer", async () => {
    const { runtime } = await makeRuntime();
    try {
      const r0 = await fetch(runtime.baseUrl + "/v1/responses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "t/x", input: "hi", tools: [TOOL] }),
      });
      expect(r0.status).toBe(200);
      const j0 = await r0.json();
      const fc = j0.output?.find((o: any) => o.type === "function_call");
      expect(fc).toBeDefined();
      const r1 = await fetch(runtime.baseUrl + "/v1/responses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "t/x", previous_response_id: j0.id, input: [{ type: "function_call_output", call_id: fc.call_id, output: "ok" }] }),
      });
      expect(r1.status).toBe(200);
      const j1 = await r1.json();
      expect(j1.status).toBe("completed");
    } finally { runtime.stop(); }
  });
});
