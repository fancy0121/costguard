import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRuntime } from "../src/server/runtime";
import type { ProviderAdapter } from "../src/providers/registry";

async function runtimeWith(adapter: ProviderAdapter) {
  return startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "savetoken-responses-codex-")), SAVETOKEN_HOME: await mkdtemp(join(tmpdir(), "savetoken-responses-state-")) },
    providers: { fixture: ["model"] }, providerAdapters: [adapter], providerTier: "execution",
    taskSignals: () => ({ text: "extract records from isolated fixture input", isBatchOrRepetitive: true }),
  });
}

test("Responses E2E validates input before adapter dispatch and returns a stable redacted failure", async () => {
  let calls = 0;
  const runtime = await runtimeWith({
    descriptor: { id: "fixture", models: ["model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] },
    invoke: async () => { calls += 1; return { status: "PRESENT", actualRuntimeModel: "fixture/model", response: {} }; },
  });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "fixture/model", input: { invalid: true }, savetokenTask: "hidden task" }) });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ status: "UNKNOWN", failClosed: true, reason: "responses-input-required", routeAdmission: { decidingTier: "execution" } });
    expect(JSON.stringify(body)).not.toContain("hidden task");
    expect(calls).toBe(0);
  } finally { runtime.stop(); }
});

test("Responses E2E preserves a function call, rejects missing continuation output, and never leaks control fields", async () => {
  const observed: unknown[] = [];
  let calls = 0;
  const runtime = await runtimeWith({
    descriptor: { id: "fixture", models: ["model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] },
    invoke: async (request) => {
      observed.push(request.body);
      calls += 1;
      return calls === 1
        ? { status: "PRESENT", actualRuntimeModel: request.requestedModel, response: { output: [{ type: "function_call", name: "fixture_tool", arguments: "{}", call_id: "call_1" }] } }
        : { status: "PRESENT", actualRuntimeModel: request.requestedModel, response: { output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "done" }] }] } };
    },
  });
  try {
    const initial = await fetch(`${runtime.baseUrl}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "fixture/model", input: "use fixture tool", savetokenTask: "must-not-leak", savetokenTier: "execution", tools: [{ type: "function", name: "fixture_tool", parameters: { type: "object" } }] }) });
    expect(initial.status).toBe(200);
    const first = await initial.json();
    const call = first.output.find((item: { type?: string }) => item.type === "function_call");
    expect(call.call_id).toBe("call_1");
    expect(observed[0]).toEqual({ model: "fixture/model", input: "use fixture tool", tools: [{ type: "function", name: "fixture_tool", parameters: { type: "object" } }] });

    const missing = await fetch(`${runtime.baseUrl}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "fixture/model", previous_response_id: first.id, input: [] }) });
    expect(missing.status).toBe(422);
    expect(await missing.json()).toMatchObject({ status: "UNKNOWN", failClosed: true, reason: "quality-tool-result-required" });
    expect(calls).toBe(1);
  } finally { runtime.stop(); }
});
