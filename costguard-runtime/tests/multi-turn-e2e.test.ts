import { describe, expect, test } from "bun:test";
import { startRuntime } from "../src/server/runtime";
import type { ProviderAdapter } from "../src/providers/registry";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TOOL = { type: "function", name: "echo", parameters: { type: "object", properties: { value: { type: "string" } }, required: ["value"] } };

function fixtureAdapter(model: string): ProviderAdapter {
  let turn = 0;
  return {
    descriptor: { id: "test", models: [model], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] },
    async invoke(req) {
      turn++;
      const body = req.body as Record<string, unknown> | undefined;
      // Turn 1: return function_call
      if (turn === 1) {
        return {
          status: "PRESENT", actualRuntimeModel: "test/" + model,
          response: { model, output: [{ type: "function_call", name: "echo", arguments: '{"value":"hello"}', call_id: "call-1", status: "completed" }] },
        };
      }
      // Turn 2+: return final message with tool result context
      const hasToolResult = Array.isArray(body?.input) && (body!.input as any[]).some((i: any) => i?.type === "function_call_output");
      return {
        status: "PRESENT", actualRuntimeModel: "test/" + model,
        response: { model, output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: hasToolResult ? "processed: hello" : "ready" }] }] },
      };
    },
  };
}

describe("Multi-turn tool calls", () => {
  test("E2E: initial request â†’ function_call â†’ tool result â†’ final answer", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "mt-"));
    const costGuardHome = await mkdtemp(join(tmpdir(), "mt-"));
    const adapter = fixtureAdapter("model-x");
    const runtime = await startRuntime({
      env: { CODEX_HOME: codexHome, COSTGUARD_HOME: costGuardHome },
      providers: { test: ["model-x"] },
      providerAdapters: [adapter],
      providerTier: "execution",
      taskSignals: () => ({ text: "extract format classify json tool call data", isBatchOrRepetitive: true, isToolOrFileExecution: true }),
    });
    try {
      // Step 1: initial request
      const r1 = await fetch(runtime.baseUrl + "/v1/responses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "test/model-x", input: "Use echo tool.", tools: [TOOL], tool_choice: "auto" }),
      });
      expect(r1.status).toBe(200);
      const j1 = await r1.json();
      const fc = j1.output?.find((o: any) => o.type === "function_call");
      expect(fc).toBeDefined();
      expect(fc.name).toBe("echo");
      expect(fc.call_id).toBeDefined();
      
      // Step 2: submit tool result
      const r2 = await fetch(runtime.baseUrl + "/v1/responses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "test/model-x", previous_response_id: j1.id, input: [{ type: "function_call_output", call_id: fc.call_id, output: "hello" }] }),
      });
      expect(r2.status).toBe(200);
      const j2 = await r2.json();
      const msg = j2.output?.find((o: any) => o.type === "message");
      expect(msg).toBeDefined();
      expect(msg.content?.[0]?.text).toContain("hello");
    } finally { runtime.stop(); }
  });

  test("E2E: invalid tool result JSON fails closed", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "mt2-"));
    const costGuardHome = await mkdtemp(join(tmpdir(), "mt2-"));
    const adapter = fixtureAdapter("model-y");
    const runtime = await startRuntime({
      env: { CODEX_HOME: codexHome, COSTGUARD_HOME: costGuardHome },
      providers: { test: ["model-y"] },
      providerAdapters: [adapter],
      providerTier: "execution",
      taskSignals: () => ({ text: "extract format json tool call data classify", isBatchOrRepetitive: true, isToolOrFileExecution: true }),
    });
    try {
      const r1 = await fetch(runtime.baseUrl + "/v1/responses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "test/model-y", input: "Use echo.", tools: [TOOL] }),
      });
      const j1 = await r1.json();
      const fc = j1.output?.find((o: any) => o.type === "function_call");
      // Submit with missing call_id
      const r2 = await fetch(runtime.baseUrl + "/v1/responses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "test/model-y", previous_response_id: j1.id, input: [{ type: "function_call_output", output: "bad" }] }),
      });
      // A missing call_id is rejected before provider continuation.
      expect(r2.status).toBe(422);
    } finally { runtime.stop(); }
  });
});
