import { expect, test } from "bun:test";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRuntime } from "../src/server/runtime";

const token = ["fixture", "telemetry", "token"].join("-");

function options(codexHome: string, costGuardHome: string) {
  return {
    env: { CODEX_HOME: codexHome, COSTGUARD_HOME: costGuardHome },
    providers: { fixture: ["model"] }, managementToken: token, providerTier: "execution" as const,
    taskSignals: () => ({ text: "extract isolated fixture fields", isBatchOrRepetitive: true }),
    providerAdapters: [{
      descriptor: { id: "fixture", models: ["model"], auth: "fixture" as const, health: "healthy" as const, tier: "execution" as const, capabilities: ["responses" as const] },
      invoke: async (request: { requestedModel: string }) => ({ status: "PRESENT" as const, actualRuntimeModel: request.requestedModel, response: { output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }] } }),
    }],
  };
}

test("isolated runtime persists redacted usage and debug metadata across restart without retaining request body", async () => {
  const root = await mkdtemp(join(tmpdir(), "costguard-telemetry-"));
  const codexHome = join(root, "codex");
  const costGuardHome = join(root, "state");
  const requestBody = { model: "fixture/model", input: "sensitive fixture text must not persist" };
  let first = await startRuntime(options(codexHome, costGuardHome));
  try {
    expect((await fetch(`${first.baseUrl}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) })).status).toBe(200);
  } finally { first.stop(); }

  const usagePath = join(costGuardHome, "telemetry", "usage.json");
  const debugPath = join(costGuardHome, "telemetry", "debug.json");
  const persisted = `${await readFile(usagePath, "utf8")}\n${await readFile(debugPath, "utf8")}`;
  expect(persisted).toContain("fixture");
  expect(persisted).not.toContain(requestBody.input);
  expect(persisted).not.toContain(token);

  const second = await startRuntime(options(codexHome, costGuardHome));
  try {
    const headers = { authorization: `Bearer ${token}` };
    expect(await (await fetch(`${second.baseUrl}/api/usage`, { headers })).json()).toEqual({ requests: 1, measuredTokenRequests: 0, unreportedRequests: 1 });
    expect(await (await fetch(`${second.baseUrl}/api/logs`, { headers })).json()).toMatchObject([{ event: "responses.completed", status: "PRESENT" }]);
  } finally { second.stop(); await rm(root, { recursive: true, force: true }); }
});

test("runtime refuses an unowned telemetry target instead of overwriting it", async () => {
  const root = await mkdtemp(join(tmpdir(), "costguard-telemetry-unowned-"));
  const costGuardHome = join(root, "state");
  const usagePath = join(costGuardHome, "telemetry", "usage.json");
  await (await import("node:fs/promises")).mkdir(join(costGuardHome, "telemetry"), { recursive: true });
  await writeFile(usagePath, '{"user":"telemetry"}\n', "utf8");
  try {
    await expect(startRuntime(options(join(root, "codex"), costGuardHome))).rejects.toThrow("telemetry-state-unverified");
    expect(await readFile(usagePath, "utf8")).toBe('{"user":"telemetry"}\n');
    await expect(access(join(costGuardHome, "runtime.json"))).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
