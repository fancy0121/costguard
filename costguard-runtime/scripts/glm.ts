import { startRuntime } from "../src/server/runtime";
import { createOpenCodexProxyAdapters } from "../src/providers/opencodex-proxy";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const codexHome = await mkdtemp(join(tmpdir(), "glm-"));
const costGuardHome = await mkdtemp(join(tmpdir(), "glm-"));
const adapters = createOpenCodexProxyAdapters({ baseUrl: "http://127.0.0.1:10100" });
const providerMap: Record<string, string[]> = {};
for (const a of adapters) providerMap[a.descriptor.id] = a.descriptor.models;

const runtime = await startRuntime({
  env: { CODEX_HOME: codexHome, COSTGUARD_HOME: costGuardHome },
  providers: providerMap,
  providerAdapters: adapters,
  providerTier: "execution",
  taskSignals: (body: Record<string, unknown>) => ({ text: "extract format classify text data to json", isBatchOrRepetitive: true, isToolOrFileExecution: true }),
});

const res = await fetch(runtime.baseUrl + "/v1/responses", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ model: "zhipu-bigmodel/glm-5.2", input: "Say pong." }),
});
const json = await res.json();
console.log("HTTP:", res.status, "Model:", json.model, "Usage:", json.usage?.total_tokens, "tokens");
runtime.stop();
