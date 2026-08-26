import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRuntime } from "./server/runtime";
import type { ProviderAdapter } from "./providers/registry";
import type { CostGuardTaskSignals, CostGuardTier } from "./types";

export type CostGuardDemoResult = {
  status: "PRESENT";
  notice: "演示，非真实 Provider";
  baseUrls: string[];
  cases: Array<{ id: string; httpStatus: number; status: string; model?: string }>;
};

function fixtureAdapter(id: string, models: string[], tier: CostGuardTier): ProviderAdapter {
  return {
    descriptor: { id, models, auth: "fixture", health: "healthy", tier, capabilities: ["responses"] },
    invoke: async ({ requestedModel }) => ({
      status: "PRESENT",
      actualRuntimeModel: requestedModel,
      response: {
        id: `demo-${id}`,
        object: "response",
        status: "completed",
        model: requestedModel,
        output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "fixture demo" }] }],
        usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      },
    }),
  };
}

function openAiFixtureAdapter(): ProviderAdapter {
  const models = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];
  return {
    descriptor: {
      id: "openai",
      models,
      modelTiers: { "gpt-5.6-sol": "sol", "gpt-5.6-terra": "terra", "gpt-5.6-luna": "execution" },
      auth: "fixture",
      health: "healthy",
      capabilities: ["responses"],
    },
    invoke: async ({ requestedModel }) => ({
      status: "PRESENT",
      actualRuntimeModel: requestedModel,
      response: { id: "demo-openai", object: "response", status: "completed", model: requestedModel, output: [], usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } },
    }),
  };
}

function signals(body: Record<string, unknown>): CostGuardTaskSignals | undefined {
  if (typeof body.costguardTask !== "string") return undefined;
  if (body.costguardTask === "high-risk") return { text: "production permission migration", hasSecurityOrPermissionImpact: true, hasProductionOrMigrationImpact: true };
  return { text: "extract the title and date from each isolated record", isBatchOrRepetitive: true };
}

async function call(baseUrl: string, body: Record<string, unknown>): Promise<{ httpStatus: number; status: string; model?: string }> {
  const response = await fetch(`${baseUrl}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const value = await response.json() as Record<string, unknown>;
  return { httpStatus: response.status, status: typeof value.status === "string" ? value.status : "UNKNOWN", ...(typeof value.model === "string" ? { model: value.model } : {}) };
}

export async function runCostGuardDemo(): Promise<CostGuardDemoResult> {
  const fullHome = await mkdtemp(join(tmpdir(), "costguard-demo-full-"));
  const closedHome = await mkdtemp(join(tmpdir(), "costguard-demo-closed-"));
  const full = await startRuntime({
    env: { COSTGUARD_HOME: fullHome, CODEX_HOME: join(fullHome, "codex") },
    providers: { openai: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"], deepseek: ["deepseek-v4-flash"], "zhipu-bigmodel": ["glm-5.2"] },
    providerAdapters: [
      openAiFixtureAdapter(),
      fixtureAdapter("deepseek", ["deepseek-v4-flash"], "execution"),
      fixtureAdapter("zhipu-bigmodel", ["glm-5.2"], "glm-backup"),
    ],
    taskSignals: signals,
    port: 0,
  });
  const closed = await startRuntime({
    env: { COSTGUARD_HOME: closedHome, CODEX_HOME: join(closedHome, "codex") },
    providers: { deepseek: ["deepseek-v4-flash"] },
    providerAdapters: [fixtureAdapter("deepseek", ["deepseek-v4-flash"], "execution")],
    taskSignals: signals,
    port: 0,
  });
  try {
    const lowRisk = await call(full.baseUrl, { model: "deepseek/deepseek-v4-flash", input: "extract fixture", costguardTask: "low-risk" });
    const highRisk = await call(closed.baseUrl, { model: "deepseek/deepseek-v4-flash", input: "production permission migration", costguardTask: "high-risk" });
    return {
      status: "PRESENT",
      notice: "演示，非真实 Provider",
      baseUrls: [full.baseUrl, closed.baseUrl],
      cases: [
        { id: "low-risk-execution", ...lowRisk },
        { id: "high-risk-no-downgrade", ...highRisk },
      ],
    };
  } finally {
    full.stop();
    closed.stop();
  }
}
