import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { createOpenCodexProxyAdapters } from "../src/providers/opencodex-proxy";
import { startRuntime } from "../src/server/runtime";
import type { SaveTokenTaskSignals, SaveTokenTier } from "../src/types";
import { benchmarkAuthorization } from "../src/benchmark/authorization";

type Fixture = { id: string; category: string; input: string; goal: string; scope: string; nonGoals: string; expectedTier: SaveTokenTier; expectedModel: string; acceptance: { type: "json_answer"; expected: { answer: string } } };
type FixtureDocument = { date: string; tasks: Fixture[] };

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function tierSignals(fixture: Fixture): SaveTokenTaskSignals {
  if (fixture.expectedTier === "sol") return { text: fixture.input, hasSecurityOrPermissionImpact: true, hasProductionOrMigrationImpact: fixture.category === "migration-production" };
  if (fixture.expectedTier === "terra") return { text: fixture.input, modulesTouched: 3 };
  return { text: fixture.input, isToolOrFileExecution: fixture.expectedModel.includes("luna"), isBatchOrRepetitive: fixture.expectedModel.includes("deepseek") };
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractText).join("");
  if (typeof value !== "object" || value === null) return "";
  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  if (typeof record.output_text === "string") return record.output_text;
  if (Array.isArray(record.content)) return extractText(record.content);
  if (Array.isArray(record.output)) return extractText(record.output);
  return "";
}

const root = join(import.meta.dir, "..", "..");
const fixturePath = join(root, "docs", "superpowers", "evidence", "savetoken-quality-routing-benchmark-fixtures-2026-08-13.json");
const fixtures = JSON.parse(await readFile(fixturePath, "utf8")) as FixtureDocument;
const authorization = benchmarkAuthorization(process.env);
if (authorization.status !== "PRESENT") {
  const outputDir = join(root, "docs", "superpowers", "evidence");
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "savetoken-quality-routing-benchmark-2026-08-13.json"), `${JSON.stringify({ date: "2026-08-13", fixtureHash: hash(fixtures), requestCount: 0, status: "UNKNOWN", failClosed: true, reason: authorization.reason }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ requestCount: 0, status: "UNKNOWN", reason: authorization.reason }));
  process.exitCode = 1;
} else {
const temporaryRoot = await mkdtemp(join(tmpdir(), "savetoken-quality-benchmark-"));
const results: Array<Record<string, unknown>> = [];

for (const fixture of fixtures.tasks) {
  const slash = fixture.expectedModel.indexOf("/");
  const provider = fixture.expectedModel.slice(0, slash);
  const model = fixture.expectedModel.slice(slash + 1);
  const runtime = await startRuntime({
    env: { CODEX_HOME: join(temporaryRoot, `${fixture.id}-codex`), SAVETOKEN_HOME: join(temporaryRoot, `${fixture.id}-state`) },
    providers: { [provider]: [model] },
    providerAdapters: createOpenCodexProxyAdapters({ baseUrl: "http://127.0.0.1:10100" }),
    providerTier: fixture.expectedTier,
    taskSignals: () => tierSignals(fixture),
  });
  try {
    const request = `${fixture.input}\nReturn only a JSON object with the answer field.`;
    const response = await fetch(`${runtime.baseUrl}/v1/responses`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: fixture.expectedModel, input: request, savetokenTask: fixture.input,
        text: { format: { type: "json_schema", json_schema: { schema: { type: "object", required: ["answer"], properties: { answer: { type: "string" } }, additionalProperties: false } } } },
      }),
    });
    const body = await response.json().catch(() => ({ status: "UNKNOWN", reason: "non-json-response" })) as Record<string, unknown>;
    const output = extractText(body.output).trim();
    let parsedOutput: unknown;
    try { parsedOutput = JSON.parse(output); } catch { parsedOutput = undefined; }
    const exactOutput = JSON.stringify(parsedOutput) === JSON.stringify(fixture.acceptance.expected);
    const actualModel = typeof body.model === "string" ? body.model : "UNKNOWN";
    const routeAdmission = response.headers.get("x-savetoken-route-admission");
    const expectedRoute = routeAdmission ? JSON.parse(routeAdmission) as Record<string, unknown> : undefined;
    const acceptance = response.status === 200 && actualModel === fixture.expectedModel && exactOutput && expectedRoute?.requestedTier === fixture.expectedTier;
    results.push({ id: fixture.id, category: fixture.category, requestedModel: fixture.expectedModel, actualModel, httpStatus: response.status, requestedTier: fixture.expectedTier, routeAdmission: expectedRoute ?? "UNKNOWN", usage: typeof body.usage === "object" && body.usage !== null ? body.usage : "UNKNOWN", responseHash: hash(body), outputHash: hash(output), exactOutput, acceptance: acceptance ? "PRESENT" : "UNKNOWN", deviations: { modelIdentity: actualModel !== fixture.expectedModel, exactOutput: !exactOutput, routeEvidence: expectedRoute?.requestedTier !== fixture.expectedTier } });
  } catch {
    results.push({ id: fixture.id, category: fixture.category, requestedModel: fixture.expectedModel, actualModel: "UNKNOWN", httpStatus: "UNKNOWN", usage: "UNKNOWN", acceptance: "UNKNOWN", reason: "saveToken-loopback-proxy-request-failed" });
  } finally {
    runtime.stop();
  }
}

const outputDir = join(root, "docs", "superpowers", "evidence");
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, "savetoken-quality-routing-benchmark-2026-08-13.json"), `${JSON.stringify({ date: "2026-08-13", fixtureHash: hash(fixtures), requestCount: fixtures.tasks.length, results }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ requestCount: fixtures.tasks.length, present: results.filter((r) => r.acceptance === "PRESENT").length, unknown: results.filter((r) => r.acceptance === "UNKNOWN").length }));
process.exitCode = results.every((result) => result.acceptance === "PRESENT") ? 0 : 1;
}
