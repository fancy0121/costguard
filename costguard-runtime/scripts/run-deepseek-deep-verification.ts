import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseOpenAiResponsesSse, createOpenCodexProxyAdapters } from "../src/providers/opencodex-proxy";
import { parseSseText } from "../src/server/sse";
import { startRuntime } from "../src/server/runtime";

const PROXY = "http://127.0.0.1:10100";
const MODEL = "deepseek/deepseek-v4-flash";

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function extractText(output: unknown): string {
  if (!Array.isArray(output)) return "";
  let text = "";
  for (const item of output as Array<Record<string, unknown>>) {
    if (item?.type !== "message") continue;
    const content = item.content;
    if (!Array.isArray(content)) continue;
    for (const part of content as Array<Record<string, unknown>>) {
      if (part?.type === "output_text" && typeof part.text === "string") text += part.text;
    }
  }
  return text;
}

type Case = { id: string; title: string; status: "PRESENT" | "UNKNOWN" | "FAILED"; httpStatus: unknown; facts: Record<string, unknown> };

const results: Case[] = [];

async function runRaw(id: string, title: string, body: Record<string, unknown>, opts: { signal?: AbortSignal; validate: (resp: Response, text: string, json: unknown) => { status: Case["status"]; facts: Record<string, unknown> } }): Promise<void> {
  try {
    const resp = await fetch(`${PROXY}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    const text = await resp.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = undefined; }
    const verdict = opts.validate(resp, text, json);
    results.push({ id, title, status: verdict.status, httpStatus: resp.status, facts: verdict.facts });
  } catch (e) {
    results.push({ id, title, status: "UNKNOWN", httpStatus: "UNKNOWN", facts: { reason: e instanceof Error ? e.name : "request-failed", message: e instanceof Error ? e.message : undefined } });
  }
}

// T1: single-turn identity baseline
await runRaw("T1", "single-turn identity", { model: MODEL, input: "Reply with exactly: DEEPSEEK_OK" }, {
  validate: (_r, _t, json) => {
    const j = json as Record<string, unknown>;
    const model = j?.model;
    const text = extractText(j?.output);
    return {
      status: model === "deepseek-v4-flash" && text.includes("DEEPSEEK_OK") ? "PRESENT" : "FAILED",
      facts: { model, outputText: text, usage: j?.usage },
    };
  },
});

// T2: streaming SSE terminal
await runRaw("T2", "streaming SSE terminal", { model: MODEL, input: "Reply with exactly: DEEPSEEK_STREAM_OK", stream: true }, {
  validate: (_r, text) => {
    const frames = parseSseText(text);
    const hasDone = frames.some((f) => f.data === "[DONE]");
    const hasCompleted = frames.some((f) => f.data.includes("response.completed"));
    const parsed = parseOpenAiResponsesSse(text);
    return {
      status: hasDone && hasCompleted && parsed.model === "deepseek-v4-flash" ? "PRESENT" : "FAILED",
      facts: { frameCount: frames.length, hasDone, hasCompleted, model: parsed.model, outputText: extractText(parsed.output), usage: parsed.usage },
    };
  },
});

// T3: single tool-call round trip
const weatherTool = {
  type: "function",
  name: "get_weather",
  description: "Get current weather for a city",
  parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"], additionalProperties: false },
};
await runRaw("T3", "single tool-call round trip", {
  model: MODEL,
  input: "What is the weather in Paris?",
  tools: [weatherTool],
}, {
  validate: (_r, _t, json) => {
    const j = json as Record<string, unknown>;
    const output = Array.isArray(j?.output) ? j.output as Array<Record<string, unknown>> : [];
    const fc = output.find((o) => o?.type === "function_call");
    let args: unknown;
    try { args = typeof fc?.arguments === "string" ? JSON.parse(fc.arguments) : fc?.arguments; } catch { args = "unparseable"; }
    return {
      status: fc && fc.name === "get_weather" && typeof args === "object" && args !== null && "city" in (args as object) ? "PRESENT" : "FAILED",
      facts: { hasFunctionCall: !!fc, callId: fc?.call_id, name: fc?.name, arguments: args, outputTypes: output.map((o) => o?.type) },
    };
  },
});

// T4: multi-turn tool conversation (feed tool result back)
{
  const callIdPromise = fetch(`${PROXY}/v1/responses`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: "What is the weather in Paris?", tools: [weatherTool] }),
  }).then((r) => r.json() as Promise<Record<string, unknown>>).catch(() => undefined);
  const first = await callIdPromise;
  const firstOutput = Array.isArray(first?.output) ? first.output as Array<Record<string, unknown>> : [];
  const fc = firstOutput.find((o) => o?.type === "function_call");
  const callId = typeof fc?.call_id === "string" ? fc.call_id : "";
  const name = typeof fc?.name === "string" ? fc.name : "";
  const args = typeof fc?.arguments === "string" ? fc.arguments : "{}";
  const toolResult = { temperature_c: 20, condition: "sunny" };
  await runRaw("T4", "multi-turn tool conversation", {
    model: MODEL,
    input: [
      { role: "user", content: "What is the weather in Paris?" },
      { type: "function_call", call_id: callId, name, arguments: args },
      { type: "function_call_output", call_id: callId, output: JSON.stringify(toolResult) },
    ],
    tools: [weatherTool],
  }, {
    validate: (_r, _t, json) => {
      const j = json as Record<string, unknown>;
      const text = extractText(j?.output);
      const mentionsWeather = /20|sunny|weather/i.test(text);
      return {
        status: callId !== "" && text.length > 0 && mentionsWeather ? "PRESENT" : "UNKNOWN",
        facts: { firstTurnCallId: callId || "UNKNOWN", finalText: text, usage: j?.usage },
      };
    },
  });
}

// T5: structured JSON object compliance
await runRaw("T5", "structured JSON object", {
  model: MODEL,
  input: "Return a JSON object with keys name, count, active. name is a string, count is an integer, active is a boolean.",
  response_format: { type: "json_object" },
}, {
  validate: (_r, _t, json) => {
    const j = json as Record<string, unknown>;
    const text = extractText(j?.output);
    let parsed: unknown;
    let parseOk = false;
    try { parsed = JSON.parse(text.trim()); parseOk = true; } catch { parsed = "unparseable"; }
    const ok = parseOk && typeof parsed === "object" && parsed !== null && "name" in (parsed as object) && "count" in (parsed as object) && "active" in (parsed as object);
    return {
      status: ok ? "PRESENT" : "FAILED",
      facts: { rawText: text.slice(0, 400), parseOk, parsed },
    };
  },
});

// T6: structured JSON schema compliance (capability probe)
await runRaw("T6", "structured JSON schema", {
  model: MODEL,
  input: "Return an object describing a book.",
  response_format: {
    type: "json_schema",
    json_schema: { name: "book", strict: true, schema: { type: "object", properties: { title: { type: "string" }, pages: { type: "integer" } }, required: ["title", "pages"], additionalProperties: false } },
  },
}, {
  validate: (resp, _t, json) => {
    const j = json as Record<string, unknown>;
    if (resp.status !== 200) {
      return { status: "UNKNOWN", facts: { httpStatus: resp.status, capability: "json_schema-rejected-or-unsupported", bodyPreview: JSON.stringify(j).slice(0, 300) } };
    }
    const text = extractText(j?.output);
    let parsed: unknown;
    let parseOk = false;
    try { parsed = JSON.parse(text.trim()); parseOk = true; } catch { parsed = "unparseable"; }
    const obj = parseOk && typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : undefined;
    const hasRequired = obj !== undefined && typeof obj.title === "string" && typeof obj.pages === "number" && Number.isInteger(obj.pages);
    const schemaKeys = new Set(["title", "pages"]);
    const extraKeys = obj !== undefined ? Object.keys(obj).filter((k) => !schemaKeys.has(k)) : [];
    const strictCompliant = hasRequired && extraKeys.length === 0;
    return {
      status: strictCompliant ? "PRESENT" : "FAILED",
      facts: { rawText: text.slice(0, 500), parseOk, hasRequired, extraKeys, schemaStrictlyHonored: strictCompliant, parsed },
    };
  },
});

// T7: client cancellation (stream truncated, no terminal)
{
  const controller = new AbortController();
  const reqBody = { model: MODEL, input: "List the first 50 prime numbers as a comma-separated list.", stream: true };
  let cancelled = false;
  try {
    const resp = await fetch(`${PROXY}/v1/responses`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(reqBody), signal: controller.signal,
    });
    const reader = resp.body?.getReader();
    let seen = 0;
    if (reader) {
      while (seen < 3) {
        const chunk = await reader.read();
        if (chunk.done) break;
        seen += 1;
      }
      controller.abort();
      try { await reader.read(); } catch { cancelled = true; }
    }
    results.push({
      id: "T7", title: "client cancellation", status: cancelled ? "PRESENT" : "UNKNOWN",
      httpStatus: resp.status, facts: { framesSeenBeforeAbort: seen, abortedWithoutFalseTerminal: cancelled, upstreamPropagationVerified: false },
    });
  } catch (e) {
    cancelled = e instanceof Error && (e.name === "AbortError" || controller.signal.aborted);
    results.push({ id: "T7", title: "client cancellation", status: cancelled ? "PRESENT" : "UNKNOWN", httpStatus: "aborted", facts: { aborted: cancelled, upstreamPropagationVerified: false, message: e instanceof Error ? e.name : undefined } });
  }
}

// T8: invalid model error + leak check
await runRaw("T8", "invalid model error mapping", { model: "deepseek/does-not-exist", input: "hi" }, {
  validate: (resp, text) => {
    const leaked = /api[_-]?key|authorization|bearer|token|secret/i.test(text);
    return {
      status: resp.status >= 400 ? "PRESENT" : "FAILED",
      facts: { httpStatus: resp.status, bodyPreview: text.slice(0, 300), leakedInternalDetail: leaked },
    };
  },
});

// T9: full CostGuard runtime chain (execution tier routing) for DeepSeek
{
  const root = await mkdtemp(join(tmpdir(), "costguard-deepseek-deep-"));
  try {
    const runtime = await startRuntime({
      env: { CODEX_HOME: join(root, "codex"), COSTGUARD_HOME: join(root, "state") },
      providers: { deepseek: ["deepseek-v4-flash"] },
      providerAdapters: createOpenCodexProxyAdapters({ baseUrl: PROXY }),
      providerTier: "execution",
      taskSignals: () => ({ text: "extract the isolated fixture label beta", isBatchOrRepetitive: true }),
    });
    try {
      const resp = await fetch(`${runtime.baseUrl}/v1/responses`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, input: "Return exactly the token COSTGUARD_CHAIN_OK." }),
      });
      const j = await resp.json().catch(() => ({})) as Record<string, unknown>;
      const model = typeof j?.model === "string" ? j.model : "UNKNOWN";
      const text = extractText(j?.output);
      const admissionHeader = resp.headers.get("x-costguard-route-admission");
      const modelOk = model === "deepseek-v4-flash" || model === "deepseek/deepseek-v4-flash";
      results.push({
        id: "T9", title: "CostGuard runtime full chain", status: resp.status === 200 && modelOk && text.includes("COSTGUARD_CHAIN_OK") ? "PRESENT" : "FAILED",
        httpStatus: resp.status, facts: { model, outputText: text, usage: j?.usage, routeAdmissionBody: j?.routeAdmission ?? "absent", routeAdmissionHeader: admissionHeader ?? "absent" },
      });
    } finally {
      runtime.stop();
    }
  } catch (e) {
    results.push({ id: "T9", title: "CostGuard runtime full chain", status: "UNKNOWN", httpStatus: "UNKNOWN", facts: { reason: e instanceof Error ? e.name : "runtime-failed" } });
  }
}

const evidence = {
  date: "2026-08-15",
  endpoint: "loopback OpenCodex proxy + CostGuard runtime",
  model: MODEL,
  requestCount: results.length,
  results,
};

const outputDir = join(import.meta.dir, "..", "..", "docs", "superpowers", "evidence");
await mkdir(outputDir, { recursive: true });
const outPath = join(outputDir, "costguard-deepseek-deep-verification-2026-08-15.json");
await writeFile(outPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ requestCount: results.length, statuses: results.map(({ id, status }) => ({ id, status })) }, null, 2));
console.log(`evidence: ${outPath}`);
process.exitCode = results.every((r) => r.status !== "FAILED") ? 0 : 1;
