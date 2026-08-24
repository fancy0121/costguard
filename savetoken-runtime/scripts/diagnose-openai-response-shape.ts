import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOpenCodexProxyAdapters } from "../src/providers/opencodex-proxy";
import { startRuntime } from "../src/server/runtime";

const root = await mkdtemp(join(tmpdir(), "savetoken-shape-diagnostic-"));
const runtime = await startRuntime({
  env: { CODEX_HOME: join(root, "codex"), SAVETOKEN_HOME: join(root, "state") },
  providers: { deepseek: ["deepseek-v4-flash"] }, providerAdapters: createOpenCodexProxyAdapters({ baseUrl: "http://127.0.0.1:10100" }), providerTier: "execution",
  taskSignals: () => ({ text: "extract isolated fixture beta", isBatchOrRepetitive: true }),
});
try {
  const response = await fetch(`${runtime.baseUrl}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "deepseek/deepseek-v4-flash", input: "Return exactly beta" }) });
  const body = await response.json() as Record<string, unknown>;
  const output = body.output;
  const describe = (value: unknown): unknown => Array.isArray(value)
    ? value.map((item) => typeof item === "object" && item !== null ? { keys: Object.keys(item as Record<string, unknown>), type: (item as Record<string, unknown>).type, contentTypes: Array.isArray((item as Record<string, unknown>).content) ? ((item as Record<string, unknown>).content as unknown[]).map((part) => typeof part === "object" && part !== null ? (part as Record<string, unknown>).type : typeof part) : undefined } : typeof item)
    : typeof value;
  console.log(JSON.stringify({ httpStatus: response.status, model: body.model, outputShape: describe(output), routeAdmission: response.headers.get("x-savetoken-route-admission") ? "present" : "missing" }));
} finally {
  runtime.stop();
}
