import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

type Acceptance = Record<string, unknown> & { type: string };

export type BenchmarkFixture = {
  id: string;
  category: string;
  expectedTier: string;
  expectedModel: string;
  input: string;
  deliveryFormat: string;
  tools?: unknown;
  acceptance: Acceptance;
};

export type BenchmarkObservation = {
  text: string;
  response: Record<string, unknown>;
  toolUsed?: boolean;
};

export type BenchmarkFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type BenchmarkUsage = {
  inputTokens: number | "UNKNOWN";
  outputTokens: number | "UNKNOWN";
  reasoningTokens: number | "UNKNOWN";
  totalTokens: number | "UNKNOWN";
};

export type BenchmarkResult = {
  id: string;
  category: string;
  expectedTier: string;
  expectedModel: string;
  requestModel: string;
  requestReasoningEffort: "default-not-overridden";
  responseModels: string[];
  responseReasoningEffort: string | "UNKNOWN";
  httpStatuses: number[];
  requestCount: number;
  pass: boolean;
  status: "PRESENT" | "MISSING" | "UNKNOWN";
  usage: BenchmarkUsage;
  outputHash: string;
  responseHashes: string[];
  detail: Record<string, unknown>;
};

export type BenchmarkEvidence = {
  date: string;
  fixturePath: string;
  model: string;
  reasoningEffort: "default-not-overridden";
  fixtureSha256: string;
  evaluatorSha256: string;
  taskCount: number;
  passCount: number;
  missingCount: number;
  unknownCount: number;
  categorySummaries: BenchmarkCategorySummary[];
  results: BenchmarkResult[];
};

export type BenchmarkCategorySummary = {
  category: string;
  taskCount: number;
  passCount: number;
  missingCount: number;
  unknownCount: number;
  passRate: number | "UNKNOWN";
  usage: BenchmarkUsage;
};

const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
const ROUTE = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ACCEPTANCE_TYPES = new Set(["exact_set", "exact_list", "exact_json", "contains_and_bound", "strict_schema", "function_call", "final_answer_uses_tool", "local_tests", "identify_bug", "required_cases", "contains_and_no_english"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function stripJsonPresentation(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; value: "unparseable" } {
  try { return { ok: true, value: JSON.parse(stripJsonPresentation(text)) }; }
  catch { return { ok: false, value: "unparseable" }; }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hash(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value), "utf8").digest("hex");
}

function extractText(output: unknown): string {
  if (!Array.isArray(output)) return "";
  let text = "";
  for (const item of output) {
    if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) if (isRecord(part) && part.type === "output_text" && typeof part.text === "string") text += part.text;
  }
  return text;
}

function extractFunctionCall(response: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!Array.isArray(response.output)) return undefined;
  return response.output.find((item): item is Record<string, unknown> => isRecord(item) && item.type === "function_call");
}

function numeric(value: unknown): number | "UNKNOWN" {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : "UNKNOWN";
}

function normalizeUsage(response: Record<string, unknown>): BenchmarkUsage {
  const usage = isRecord(response.usage) ? response.usage : {};
  const details = isRecord(usage.output_tokens_details) ? usage.output_tokens_details : isRecord(usage.outputTokensDetails) ? usage.outputTokensDetails : {};
  return {
    inputTokens: numeric(usage.input_tokens ?? usage.inputTokens),
    outputTokens: numeric(usage.output_tokens ?? usage.outputTokens),
    reasoningTokens: numeric(details.reasoning_tokens ?? details.reasoningTokens ?? usage.reasoning_tokens ?? usage.reasoningTokens),
    totalTokens: numeric(usage.total_tokens ?? usage.totalTokens),
  };
}

function sumUsage(usages: BenchmarkUsage[]): BenchmarkUsage {
  const sum = (key: keyof BenchmarkUsage): number | "UNKNOWN" => usages.every((usage) => typeof usage[key] === "number")
    ? usages.reduce((total, usage) => total + (usage[key] as number), 0)
    : "UNKNOWN";
  return { inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"), reasoningTokens: sum("reasoningTokens"), totalTokens: sum("totalTokens") };
}

function extractCode(text: string, functionName: string): string {
  const fenced = text.match(/```(?:typescript|ts|javascript|js)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) return fenced.trim();
  const escaped = escapeRegExp(functionName);
  const start = text.search(new RegExp(`(?:function\\s+${escaped}|(?:const|let)\\s+${escaped}\\s*=)`));
  return start >= 0 ? text.slice(start).trim() : text.trim();
}

async function runLocalCases(sourceText: string, functionName: unknown, cases: unknown): Promise<{ pass: boolean; outcomes: unknown }> {
  if (typeof functionName !== "string" || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(functionName) || !Array.isArray(cases) || !cases.every((value) => Array.isArray(value) && value.length >= 2)) return { pass: false, outcomes: "invalid-local-tests" };
  const escaped = escapeRegExp(functionName);
  const source = extractCode(sourceText, functionName).replace(new RegExp(`\\bexport\\s+(?:default\\s+)?(?=(?:function|const|let)\\s+${escaped})`), "");
  if (source.length === 0 || source.length > 10_000) return { pass: false, outcomes: "code-size-invalid" };
  if (/\b(?:import|require|process|Bun|Deno|fetch|WebSocket|eval|Function|globalThis|constructor|__proto__|prototype)\b|__/.test(source)) return { pass: false, outcomes: "code-capability-rejected" };
  const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const context = vm.createContext({ cases: structuredClone(cases) }, { codeGeneration: { strings: false, wasm: false } });
  try {
    const outcomes = vm.runInContext(`${javascript}\nif (typeof ${functionName} !== "function") throw new Error("function-missing");\ncases.map((row) => { const args = row.slice(0, -1); const expected = row.at(-1); return { args, expected, actual: ${functionName}(...args) }; });`, context, { timeout: 100 });
    const normalized = structuredClone(outcomes) as Array<{ expected: unknown; actual: unknown }>;
    return { pass: normalized.every((entry) => entry.actual === entry.expected), outcomes: normalized };
  } catch (error) {
    return { pass: false, outcomes: error instanceof Error ? error.name : "execution-failed" };
  }
}

export async function loadBenchmarkFixtures(path: string): Promise<BenchmarkFixture[]> {
  const document = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  if (document.status !== "frozen-instrument-v2" || typeof document.changePolicy !== "string" || !Array.isArray(document.tasks) || document.tasks.length !== 24) throw new Error("benchmark-fixture-count-invalid");
  const fixtures: BenchmarkFixture[] = [];
  const ids = new Set<string>();
  const categories = new Map<string, number>();
  for (const value of document.tasks) {
    if (!isRecord(value) || typeof value.id !== "string" || typeof value.category !== "string" || typeof value.expectedTier !== "string" || typeof value.expectedModel !== "string" || typeof value.input !== "string" || typeof value.deliveryFormat !== "string" || value.deliveryFormat.length === 0 || !isRecord(value.acceptance) || typeof value.acceptance.type !== "string") throw new Error("benchmark-fixture-shape-invalid");
    if (ids.has(value.id) || !ACCEPTANCE_TYPES.has(value.acceptance.type)) throw new Error("benchmark-fixture-acceptance-invalid");
    ids.add(value.id);
    categories.set(value.category, (categories.get(value.category) ?? 0) + 1);
    fixtures.push(value as BenchmarkFixture);
  }
  if (categories.size !== 12 || [...categories.values()].some((count) => count < 2)) throw new Error("benchmark-fixture-category-underpowered");
  return fixtures;
}

export function resolveBenchmarkModel(env: Record<string, string | undefined>): string {
  const model = env.BENCH_MODEL?.trim() || DEFAULT_MODEL;
  if (!ROUTE.test(model)) throw new Error("benchmark-model-route-invalid");
  return model;
}

export async function verifyFrozenBenchmarkInstrument(manifestPath: string, fixturePath: string): Promise<{ instrumentVersion: string; fixtureSha256: string; evaluatorSha256: string }> {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  if (manifest.status !== "frozen" || manifest.instrumentVersion !== "quality-token-v2-r1-r5" || typeof manifest.fixtureSha256 !== "string" || typeof manifest.evaluatorSha256 !== "string") throw new Error("benchmark-instrument-manifest-invalid");
  const fixtureSha256 = hash(await readFile(fixturePath, "utf8"));
  const evaluatorSha256 = hash(await readFile(fileURLToPath(import.meta.url), "utf8"));
  if (fixtureSha256 !== manifest.fixtureSha256 || evaluatorSha256 !== manifest.evaluatorSha256) throw new Error("benchmark-instrument-hash-mismatch");
  return { instrumentVersion: manifest.instrumentVersion, fixtureSha256, evaluatorSha256 };
}

export async function evaluateBenchmarkAcceptance(fixture: BenchmarkFixture, observation: BenchmarkObservation): Promise<{ pass: boolean; detail: Record<string, unknown> }> {
  const acceptance = fixture.acceptance;
  const text = observation.text.trim();
  if (acceptance.type === "exact_set") {
    const parsed = parseJson(text);
    const got = parsed.ok && Array.isArray(parsed.value) && parsed.value.every((item) => typeof item === "string") ? [...parsed.value].sort() : [];
    const expected = Array.isArray(acceptance.expected) ? [...acceptance.expected].map(String).sort() : [];
    const pass = parsed.ok ? got.length === expected.length && sameJson(got, expected) : expected.every((item) => text.includes(item));
    return { pass, detail: { parseOk: parsed.ok, mode: parsed.ok ? "json-set" : "content-contains", got, expected } };
  }
  if (acceptance.type === "exact_list") {
    const parsed = parseJson(text);
    const expected = Array.isArray(acceptance.expected) ? acceptance.expected.map(String) : [];
    const vocabulary = Array.isArray(acceptance.vocabulary) ? acceptance.vocabulary.map(String) : [...new Set(expected)];
    const got = parsed.ok && Array.isArray(parsed.value)
      ? parsed.value.map(String)
      : (text.match(new RegExp(vocabulary.map(escapeRegExp).join("|"), "g")) ?? []);
    return { pass: sameJson(got, expected), detail: { parseOk: parsed.ok, mode: parsed.ok ? "json-list" : "content-labels", got, expected } };
  }
  if (acceptance.type === "exact_json") {
    const parsed = parseJson(text);
    return { pass: parsed.ok && sameJson(parsed.value, acceptance.expected), detail: { parseOk: parsed.ok, got: parsed.value, expected: acceptance.expected } };
  }
  if (acceptance.type === "contains_and_bound") {
    const mustContain = Array.isArray(acceptance.mustContain) ? acceptance.mustContain.map(String) : [];
    const compact = text.replace(/\s/g, "");
    const maxChars = typeof acceptance.maxChars === "number" ? acceptance.maxChars : -1;
    return { pass: mustContain.every((part) => compact.includes(part)) && Array.from(compact).length <= maxChars, detail: { mustContain, charCount: Array.from(compact).length, maxChars } };
  }
  if (acceptance.type === "strict_schema") {
    const parsed = parseJson(text);
    const object = parsed.ok && isRecord(parsed.value) ? parsed.value : undefined;
    const expectedKeys = Array.isArray(acceptance.properties) ? acceptance.properties.map(String).sort() : [];
    const gotKeys = object ? Object.keys(object).sort() : [];
    const extraAllowed = acceptance.additionalProperties !== false;
    const types = isRecord(acceptance.propertyTypes) ? acceptance.propertyTypes : {};
    const typeOk = (key: string): boolean => {
      if (!object) return false;
      const expectedType = types[key];
      const value = object[key];
      if (expectedType === "integer") return Number.isInteger(value);
      if (expectedType === "number") return typeof value === "number" && Number.isFinite(value);
      if (expectedType === "string" || expectedType === "boolean") return typeof value === expectedType;
      return expectedType === undefined;
    };
    const typesOk = expectedKeys.every(typeOk);
    return { pass: !!object && expectedKeys.every((key) => gotKeys.includes(key)) && (extraAllowed || sameJson(gotKeys, expectedKeys)) && typesOk, detail: { parseOk: parsed.ok, gotKeys, expectedKeys, typesOk, additionalProperties: acceptance.additionalProperties } };
  }
  if (acceptance.type === "function_call") {
    const call = extractFunctionCall(observation.response);
    let args: unknown = "unparseable";
    try { args = typeof call?.arguments === "string" ? JSON.parse(call.arguments) : call?.arguments; } catch {}
    const expectedArgs = isRecord(acceptance.argsContain) ? acceptance.argsContain : {};
    const argsOk = isRecord(args) && Object.entries(expectedArgs).every(([key, value]) => sameJson(args[key], value));
    return { pass: !!call && call.name === acceptance.name && argsOk, detail: { name: call?.name ?? "UNKNOWN", arguments: args } };
  }
  if (acceptance.type === "final_answer_uses_tool") {
    const mustContain = Array.isArray(acceptance.mustContain) ? acceptance.mustContain.map(String) : [];
    return { pass: observation.toolUsed === true && mustContain.every((part) => text.includes(part)), detail: { toolUsed: observation.toolUsed === true, mustContain } };
  }
  if (acceptance.type === "local_tests") {
    const result = await runLocalCases(text, acceptance.functionName, acceptance.cases);
    return { pass: result.pass, detail: { outcomes: result.outcomes } };
  }
  if (acceptance.type === "identify_bug") {
    const mustContain = Array.isArray(acceptance.mustContain) ? acceptance.mustContain.map(String) : [];
    return { pass: mustContain.every((part) => text.includes(part)), detail: { mustContain } };
  }
  if (acceptance.type === "required_cases") {
    const required = Array.isArray(acceptance.required) ? acceptance.required.map(String) : [];
    return { pass: required.every((part) => text.includes(part)), detail: { required } };
  }
  if (acceptance.type === "contains_and_no_english") {
    const mustContain = Array.isArray(acceptance.mustContain) ? acceptance.mustContain.map(String) : [];
    const hasAsciiLetters = /[A-Za-z]/.test(text);
    return { pass: mustContain.every((part) => text.includes(part)) && (acceptance.noAsciiLetters !== true || !hasAsciiLetters), detail: { mustContain, hasAsciiLetters } };
  }
  return { pass: false, detail: { reason: "unsupported-acceptance" } };
}

function validateProxyBaseUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || (url.pathname !== "/" && url.pathname !== "") || url.username || url.password || url.search || url.hash) throw new Error("benchmark-proxy-loopback-only");
  return url;
}

function modelMatches(requested: string, observed: unknown): observed is string {
  if (typeof observed !== "string") return false;
  return observed === requested || observed === requested.split("/").at(-1);
}

function responseEffort(response: Record<string, unknown>): string | "UNKNOWN" {
  const reasoning = isRecord(response.reasoning) ? response.reasoning : {};
  const value = reasoning.effort ?? response.reasoning_effort;
  return typeof value === "string" && value.length > 0 ? value : "UNKNOWN";
}

function summarizeCategories(results: BenchmarkResult[]): BenchmarkCategorySummary[] {
  const categories = [...new Set(results.map((result) => result.category))];
  return categories.map((category) => {
    const selected = results.filter((result) => result.category === category);
    const passCount = selected.filter((result) => result.status === "PRESENT").length;
    const missingCount = selected.filter((result) => result.status === "MISSING").length;
    const unknownCount = selected.filter((result) => result.status === "UNKNOWN").length;
    return { category, taskCount: selected.length, passCount, missingCount, unknownCount, passRate: unknownCount === 0 ? passCount / selected.length : "UNKNOWN", usage: sumUsage(selected.map((result) => result.usage)) };
  });
}

async function request(fetchImpl: BenchmarkFetch, url: URL, body: Record<string, unknown>): Promise<{ status: number; response: Record<string, unknown>; hash: string }> {
  const result = await fetchImpl(new URL("/v1/responses", url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const raw = await result.text();
  let parsed: Record<string, unknown> = {};
  try { const value = JSON.parse(raw); if (isRecord(value)) parsed = value; } catch {}
  return { status: result.status, response: parsed, hash: hash(raw) };
}

export async function runQualityTokenBenchmark(options: { fixturePath: string; model: string; proxyBaseUrl: string; date: string; fetchImpl?: BenchmarkFetch }): Promise<BenchmarkEvidence> {
  if (!ROUTE.test(options.model)) throw new Error("benchmark-model-route-invalid");
  const url = validateProxyBaseUrl(options.proxyBaseUrl);
  const fixtures = await loadBenchmarkFixtures(options.fixturePath);
  const fixtureSha256 = hash(await readFile(options.fixturePath, "utf8"));
  const evaluatorSha256 = hash(await readFile(fileURLToPath(import.meta.url), "utf8"));
  const fetchImpl = options.fetchImpl ?? fetch;
  const results: BenchmarkResult[] = [];
  for (const fixture of fixtures) {
    try {
      const body: Record<string, unknown> = { model: options.model, input: fixture.input };
      if (fixture.tools !== undefined) body.tools = fixture.tools;
      const turns = [await request(fetchImpl, url, body)];
      let toolUsed = false;
      if (fixture.acceptance.type === "final_answer_uses_tool") {
        const call = extractFunctionCall(turns[0].response);
        if (call && typeof call.call_id === "string" && typeof call.name === "string") {
          toolUsed = true;
          turns.push(await request(fetchImpl, url, {
            model: options.model,
            input: [
              { role: "user", content: fixture.input },
              { type: "function_call", call_id: call.call_id, name: call.name, arguments: typeof call.arguments === "string" ? call.arguments : JSON.stringify(call.arguments ?? {}) },
              { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(fixture.acceptance.toolResult ?? {}) },
            ],
            tools: fixture.tools,
          }));
        }
      }
      const final = turns.at(-1)!;
      const models = turns.map((turn) => typeof turn.response.model === "string" ? turn.response.model : "UNKNOWN");
      const transportValid = turns.every((turn) => turn.status === 200) && models.every((model) => modelMatches(options.model, model));
      const observation = { text: extractText(final.response.output), response: final.response, toolUsed };
      const verdict = transportValid ? await evaluateBenchmarkAcceptance(fixture, observation) : { pass: false, detail: { reason: "provider-evidence-invalid" } };
      const efforts = turns.map((turn) => responseEffort(turn.response));
      const effort = efforts.every((value) => value === efforts[0]) ? efforts[0] : "UNKNOWN";
      results.push({ id: fixture.id, category: fixture.category, expectedTier: fixture.expectedTier, expectedModel: fixture.expectedModel, requestModel: options.model, requestReasoningEffort: "default-not-overridden", responseModels: models, responseReasoningEffort: effort, httpStatuses: turns.map((turn) => turn.status), requestCount: turns.length, pass: verdict.pass, status: transportValid ? (verdict.pass ? "PRESENT" : "MISSING") : "UNKNOWN", usage: sumUsage(turns.map((turn) => normalizeUsage(turn.response))), outputHash: hash(observation.text), responseHashes: turns.map((turn) => turn.hash), detail: verdict.detail });
    } catch (error) {
      results.push({ id: fixture.id, category: fixture.category, expectedTier: fixture.expectedTier, expectedModel: fixture.expectedModel, requestModel: options.model, requestReasoningEffort: "default-not-overridden", responseModels: ["UNKNOWN"], responseReasoningEffort: "UNKNOWN", httpStatuses: [], requestCount: 0, pass: false, status: "UNKNOWN", usage: { inputTokens: "UNKNOWN", outputTokens: "UNKNOWN", reasoningTokens: "UNKNOWN", totalTokens: "UNKNOWN" }, outputHash: hash(""), responseHashes: [], detail: { reason: error instanceof Error ? error.name : "request-failed" } });
    }
  }
  return { date: options.date, fixturePath: options.fixturePath, model: options.model, reasoningEffort: "default-not-overridden", fixtureSha256, evaluatorSha256, taskCount: results.length, passCount: results.filter((result) => result.status === "PRESENT").length, missingCount: results.filter((result) => result.status === "MISSING").length, unknownCount: results.filter((result) => result.status === "UNKNOWN").length, categorySummaries: summarizeCategories(results), results };
}
