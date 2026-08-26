import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOpenCodexProxyAdapters } from "../src/providers/opencodex-proxy";
import { startRuntime } from "../src/server/runtime";
import type { CostGuardTaskSignals, CostGuardTier } from "../src/types";

type Route = { name: string; provider: string; model: string; tier: CostGuardTier; signals: CostGuardTaskSignals };

const routes: Route[] = [
  { name: "Sol", provider: "openai", model: "gpt-5.6-sol", tier: "sol", signals: { text: "Review this isolated fixture access-control decision and return a short safe conclusion.", hasSecurityOrPermissionImpact: true } },
  { name: "Terra", provider: "openai", model: "gpt-5.6-terra", tier: "terra", signals: { text: "Analyze this bounded two-module fixture and return one concise conclusion.", modulesTouched: 2 } },
  { name: "Luna", provider: "openai", model: "gpt-5.6-luna", tier: "execution", signals: { text: "Rename the isolated fixture label from alpha to beta.", isToolOrFileExecution: true } },
  { name: "DeepSeek", provider: "deepseek", model: "deepseek-v4-flash", tier: "execution", signals: { text: "Extract the word beta from this isolated fixture sentence.", isBatchOrRepetitive: true } },
  { name: "GLM", provider: "zhipu-bigmodel", model: "glm-5.2", tier: "glm-backup", signals: { text: "Classify the isolated fixture label beta as a short token.", isBatchOrRepetitive: true } },
];

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

const root = await mkdtemp(join(tmpdir(), "costguard-real-route-smoke-"));
const results: Array<Record<string, unknown>> = [];

try {
  for (const route of routes) {
    const runtime = await startRuntime({
      env: { CODEX_HOME: join(root, `${route.name}-codex`), COSTGUARD_HOME: join(root, `${route.name}-state`) },
      providers: { [route.provider]: [route.model] },
      providerAdapters: createOpenCodexProxyAdapters({ baseUrl: "http://127.0.0.1:10100" }),
      providerTier: route.tier,
      taskSignals: () => route.signals,
    });
    try {
      const response = await fetch(`${runtime.baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: `${route.provider}/${route.model}`, input: "Return exactly the token COSTGUARD_SMOKE_OK.", costguardTask: route.signals.text }),
      });
      const body = await response.json().catch(() => ({ status: "UNKNOWN", reason: "non-json-response" })) as Record<string, unknown>;
      const actualModel = typeof body.model === "string" ? body.model : "UNKNOWN";
      const usage = typeof body.usage === "object" && body.usage !== null ? body.usage : "UNKNOWN";
      results.push({ route: route.name, requestedModel: `${route.provider}/${route.model}`, httpStatus: response.status, actualModel, modelIdentityMatches: actualModel === `${route.provider}/${route.model}`, usage, routeAdmission: body.routeAdmission ?? "UNKNOWN", responseHash: hash(body), status: response.ok && actualModel === `${route.provider}/${route.model}` ? "PRESENT" : "UNKNOWN" });
    } catch {
      results.push({ route: route.name, requestedModel: `${route.provider}/${route.model}`, httpStatus: "UNKNOWN", actualModel: "UNKNOWN", usage: "UNKNOWN", status: "UNKNOWN", reason: "loopback-proxy-request-failed" });
    } finally {
      runtime.stop();
    }
  }
} finally {
  const outputDir = join(import.meta.dir, "..", "..", "docs", "superpowers", "evidence");
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "costguard-real-provider-route-matrix-smoke-2026-08-13.json"), `${JSON.stringify({ date: "2026-08-13", endpoint: "loopback OpenCodex proxy", requestCount: routes.length, results }, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({ requestCount: routes.length, statuses: results.map(({ route, status }) => ({ route, status })) }));
process.exitCode = results.every((result) => result.status === "PRESENT") ? 0 : 1;
