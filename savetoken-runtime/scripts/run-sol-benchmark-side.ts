import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  evaluateBenchmarkAcceptance,
  loadBenchmarkFixtures,
  verifyFrozenBenchmarkInstrument,
} from "../src/benchmark/quality-token";

const root = join(import.meta.dir, "..", "..");
const date = process.env.BENCH_DATE?.trim() || new Date().toISOString().slice(0, 10);
const limit = process.env.BENCH_LIMIT ? Number(process.env.BENCH_LIMIT) : 0;
const model = "gpt-5.6-sol";
const proxyBaseUrl = "http://127.0.0.1:10100";
const fixturePath = join(root, "docs", "superpowers", "evidence", "savetoken-quality-token-benchmark-fixtures-v2-2026-08-24.json");
const manifestPath = join(root, "docs", "superpowers", "evidence", "savetoken-quality-token-benchmark-instrument-v2-2026-08-24.json");

const frozen = await verifyFrozenBenchmarkInstrument(manifestPath, fixturePath);
const fixtures = await loadBenchmarkFixtures(fixturePath);

type SseParsed = {
  completed: Record<string, unknown> | null;
  outputItems: Record<string, unknown>[];
  text: string;
};

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numeric(value: unknown): number | "UNKNOWN" {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : "UNKNOWN";
}

async function solRequest(body: Record<string, unknown>): Promise<{ status: number; raw: string }> {
  const response = await fetch(new URL("/v1/responses", proxyBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, raw: await response.text() };
}

function parseSse(raw: string): SseParsed {
  let completed: Record<string, unknown> | null = null;
  const outputItems: Record<string, unknown>[] = [];
  for (const block of raw.split(/\r?\n\r?\n/)) {
    let event = "";
    let data = "";
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!data || data === "[DONE]") continue;
    let parsed: unknown;
    try { parsed = JSON.parse(data); } catch { continue; }
    if (!isRecord(parsed)) continue;
    if (event === "response.output_item.done" && isRecord(parsed.item)) outputItems.push(parsed.item);
    if (event === "response.completed" && isRecord(parsed.response)) completed = parsed.response;
  }
  let text = "";
  for (const item of outputItems) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (isRecord(part) && part.type === "output_text" && typeof part.text === "string") text += part.text;
    }
  }
  return { completed, outputItems, text };
}

function extractFunctionCall(items: Record<string, unknown>[]): Record<string, unknown> | undefined {
  return items.find((item) => item.type === "function_call");
}

function normalizeUsage(response: Record<string, unknown> | null): Record<string, number | "UNKNOWN"> {
  const usage = response && isRecord(response.usage) ? response.usage : {};
  const details = isRecord(usage.output_tokens_details) ? usage.output_tokens_details : {};
  return {
    inputTokens: numeric(usage.input_tokens),
    outputTokens: numeric(usage.output_tokens),
    reasoningTokens: numeric(details.reasoning_tokens),
    totalTokens: numeric(usage.total_tokens),
  };
}

function sumUsage(usages: Record<string, number | "UNKNOWN">[]): Record<string, number | "UNKNOWN"> {
  const sum = (key: string): number | "UNKNOWN" =>
    usages.every((usage) => typeof usage[key] === "number")
      ? usages.reduce((total, usage) => total + (usage[key] as number), 0)
      : "UNKNOWN";
  return { inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"), reasoningTokens: sum("reasoningTokens"), totalTokens: sum("totalTokens") };
}

function summarizeCategories(results: Record<string, unknown>[]): Record<string, unknown>[] {
  const categories = [...new Set(results.map((result) => result.category as string))];
  return categories.map((category) => {
    const selected = results.filter((result) => result.category === category);
    const passCount = selected.filter((result) => result.status === "PRESENT").length;
    const missingCount = selected.filter((result) => result.status === "MISSING").length;
    const unknownCount = selected.filter((result) => result.status === "UNKNOWN").length;
    return {
      category,
      taskCount: selected.length,
      passCount,
      missingCount,
      unknownCount,
      passRate: unknownCount === 0 ? passCount / selected.length : "UNKNOWN",
      usage: sumUsage(selected.map((result) => result.usage as Record<string, number | "UNKNOWN">)),
    };
  });
}

const targets = limit > 0 ? fixtures.slice(0, limit) : fixtures;
const results: Record<string, unknown>[] = [];

for (const fixture of targets) {
  try {
    const firstBody: Record<string, unknown> = { model, input: [{ role: "user", content: fixture.input }], store: false, stream: true };
    if (fixture.tools !== undefined) firstBody.tools = fixture.tools;
    const turns = [await solRequest(firstBody)];
    let parsed = parseSse(turns[0].raw);
    let toolUsed = false;
    if (fixture.acceptance.type === "final_answer_uses_tool") {
      const call = extractFunctionCall(parsed.outputItems);
      if (call && typeof call.call_id === "string" && typeof call.name === "string") {
        toolUsed = true;
        const secondBody: Record<string, unknown> = {
          model,
          input: [
            { role: "user", content: fixture.input },
            {
              type: "function_call",
              call_id: call.call_id,
              name: call.name,
              arguments: typeof call.arguments === "string" ? call.arguments : JSON.stringify(call.arguments ?? {}),
            },
            { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(fixture.acceptance.toolResult ?? {}) },
          ],
          store: false,
          stream: true,
          tools: fixture.tools,
        };
        const second = await solRequest(secondBody);
        turns.push(second);
        parsed = parseSse(second.raw);
      }
    }
    const models = turns.map((turn) => parseSse(turn.raw).completed?.model ?? "UNKNOWN");
    const modelOk = models.every((observed) => observed === model || observed === model.split("/").at(-1));
    const transportValid = turns.every((turn) => turn.status === 200) && modelOk;
    const responseObj: Record<string, unknown> = {
      output: parsed.outputItems,
      model: parsed.completed?.model,
      usage: parsed.completed?.usage,
      reasoning: parsed.completed?.reasoning,
    };
    const observation = { text: parsed.text, response: responseObj, toolUsed };
    const verdict = transportValid ? await evaluateBenchmarkAcceptance(fixture, observation) : { pass: false, detail: { reason: "provider-evidence-invalid" } };
    const efforts = turns.map((turn) => {
      const reasoning = parseSse(turn.raw).completed?.reasoning;
      const value = isRecord(reasoning) ? reasoning.effort : undefined;
      return typeof value === "string" && value.length > 0 ? value : "UNKNOWN";
    });
    const effort = efforts.every((value) => value === efforts[0]) ? efforts[0] : "UNKNOWN";
    results.push({
      id: fixture.id,
      category: fixture.category,
      expectedTier: fixture.expectedTier,
      expectedModel: fixture.expectedModel,
      requestModel: model,
      requestReasoningEffort: "default-not-overridden",
      responseModels: models,
      responseReasoningEffort: effort,
      httpStatuses: turns.map((turn) => turn.status),
      requestCount: turns.length,
      pass: verdict.pass,
      status: transportValid ? (verdict.pass ? "PRESENT" : "MISSING") : "UNKNOWN",
      usage: sumUsage(turns.map((turn) => normalizeUsage(parseSse(turn.raw).completed))),
      outputHash: hash(parsed.text),
      responseHashes: turns.map((turn) => hash(turn.raw)),
      detail: verdict.detail,
    });
  } catch (error) {
    results.push({
      id: fixture.id,
      category: fixture.category,
      expectedTier: fixture.expectedTier,
      expectedModel: fixture.expectedModel,
      requestModel: model,
      requestReasoningEffort: "default-not-overridden",
      responseModels: ["UNKNOWN"],
      responseReasoningEffort: "UNKNOWN",
      httpStatuses: [],
      requestCount: 0,
      pass: false,
      status: "UNKNOWN",
      usage: { inputTokens: "UNKNOWN", outputTokens: "UNKNOWN", reasoningTokens: "UNKNOWN", totalTokens: "UNKNOWN" },
      outputHash: hash(""),
      responseHashes: [],
      detail: { reason: error instanceof Error ? error.name : "request-failed" },
    });
  }
}

const evidence = {
  date,
  fixturePath,
  model,
  reasoningEffort: "default-not-overridden",
  fixtureSha256: frozen.fixtureSha256,
  evaluatorSha256: frozen.evaluatorSha256,
  transport: "sol-sse-store-false",
  taskCount: results.length,
  passCount: results.filter((result) => result.status === "PRESENT").length,
  missingCount: results.filter((result) => result.status === "MISSING").length,
  unknownCount: results.filter((result) => result.status === "UNKNOWN").length,
  categorySummaries: summarizeCategories(results),
  results,
};

const outPath = join(root, "docs", "superpowers", "evidence", `savetoken-quality-token-benchmark-${model.replace(/[^A-Za-z0-9._-]+/g, "-")}-${date}.json`);
await writeFile(outPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      model,
      instrumentVersion: frozen.instrumentVersion,
      transport: evidence.transport,
      taskCount: evidence.taskCount,
      passCount: evidence.passCount,
      missingCount: evidence.missingCount,
      unknownCount: evidence.unknownCount,
      outPath,
    },
    null,
    2,
  ),
);
