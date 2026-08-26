import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PROXY = "http://127.0.0.1:10100";
const MODEL = "deepseek/deepseek-v4-pro";

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

function parseJson(text: string): { ok: boolean; value: unknown } {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return { ok: true, value: JSON.parse(cleaned) }; } catch { return { ok: false, value: "unparseable" }; }
}

async function ask(body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown>; raw: string }> {
  const resp = await fetch(`${PROXY}/v1/responses`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const raw = await resp.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(raw) as Record<string, unknown>; } catch { json = { raw } as Record<string, unknown>; }
  return { status: resp.status, json, raw };
}

const results: Array<Record<string, unknown>> = [];

// P1: identity reachability
try {
  const resp = await ask({ model: MODEL, input: "Reply with exactly: DEEPSEEK_PRO_OK" });
  const text = extractText(resp.json.output);
  results.push({
    id: "P1", title: "v4-pro identity", httpStatus: resp.status,
    pass: resp.status === 200 && typeof resp.json.model === "string" && text.includes("DEEPSEEK_PRO_OK"),
    acceptance: resp.status === 200 && typeof resp.json.model === "string" && text.includes("DEEPSEEK_PRO_OK") ? "PRESENT" : "FAILED",
    facts: { model: resp.json.model ?? "UNKNOWN", outputText: text, usage: resp.json.usage ?? "UNKNOWN" },
  });
} catch (e) {
  results.push({ id: "P1", title: "v4-pro identity", httpStatus: "UNKNOWN", acceptance: "UNKNOWN", facts: { reason: e instanceof Error ? e.name : "request-failed" } });
}

// P2: strict JSON schema (additionalProperties:false) — 3 samples to detect determinism
for (let i = 1; i <= 3; i++) {
  try {
    const resp = await ask({
      model: MODEL,
      input: "返回一个描述书籍的 JSON 对象，只含 title（字符串）和 pages（整数）两个键。不要任何额外键。",
      response_format: {
        type: "json_schema",
        json_schema: { name: "book", strict: true, schema: { type: "object", properties: { title: { type: "string" }, pages: { type: "integer" } }, required: ["title", "pages"], additionalProperties: false } },
      },
    });
    const text = extractText(resp.json.output);
    const { ok, value } = parseJson(text);
    const obj = ok && typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
    const keys = obj ? Object.keys(obj).sort() : [];
    const keysOk = JSON.stringify(keys) === JSON.stringify(["pages", "title"]);
    const typesOk = obj ? typeof obj.title === "string" && Number.isInteger(obj.pages) : false;
    results.push({
      id: `P2-${i}`, title: "v4-pro strict json_schema", httpStatus: resp.status,
      pass: ok && keysOk && typesOk,
      acceptance: ok && keysOk && typesOk ? "PRESENT" : "FAILED",
      facts: { parseOk: ok, keys, typesOk, rawText: text.slice(0, 400), usage: resp.json.usage ?? "UNKNOWN" },
    });
  } catch (e) {
    results.push({ id: `P2-${i}`, title: "v4-pro strict json_schema", httpStatus: "UNKNOWN", acceptance: "UNKNOWN", facts: { reason: e instanceof Error ? e.name : "request-failed" } });
  }
}

const evidence = { date: "2026-08-15", model: MODEL, requestCount: results.length, results };
const outputDir = join(import.meta.dir, "..", "..", "docs", "superpowers", "evidence");
await mkdir(outputDir, { recursive: true });
const outPath = join(outputDir, "costguard-deepseek-v4-pro-probe-2026-08-15.json");
await writeFile(outPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ requestCount: results.length, statuses: results.map(({ id, acceptance }) => ({ id, acceptance })) }, null, 2));
console.log(`evidence: ${outPath}`);
process.exitCode = results.every((r) => r.acceptance !== "FAILED") ? 0 : 1;
