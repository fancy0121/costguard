import { startRuntime } from "./server/runtime";
import { runtimeOptionsFromEnvironment } from "./config/entrypoint";

const providers = process.env.COSTGUARD_PROVIDERS_JSON
  ? JSON.parse(process.env.COSTGUARD_PROVIDERS_JSON) as Record<string, string[]>
  : {};

if (import.meta.main) {
  const runtime = await startRuntime(runtimeOptionsFromEnvironment(process.env, providers));
  const actualStatus = runtime.baseUrl ? "ready" : "failed";
  console.log(JSON.stringify({ status: actualStatus, baseUrl: runtime.baseUrl, actualRuntimeModel: "UNKNOWN" }));
  process.on("SIGINT", () => runtime.stop());
}

export { startRuntime } from "./server/runtime";
export { decideRoute } from "./routing/route";
export { resolveProviderModel } from "./providers/route";
export { discoverTrustedProxyModels, parseBoundedModelDiscovery } from "./providers/discovery";
export { ProviderRegistry, invokeWithFailover } from "./providers/registry";
export { selectProviderAccount } from "./providers/availability";
export { createOpenCodexProxyAdapter, createOpenCodexProxyAdapters } from "./providers/opencodex-proxy";
export { credentialReference } from "./providers/auth";
export { writeCatalog, backupCatalog, restoreCatalog, projectCatalogToCodexHome } from "./codex/catalog";
export { clampEffort, resolveSubagentModel, resolveCombo, ComboRouter } from "./codex/policy";
export type { ComboDefinition, ComboStrategy, ComboTarget } from "./codex/policy";
export { selectSidecar } from "./sidecars/capabilities";
export { createServicePlan } from "./service/lifecycle";
export { runCalibration } from "./calibration/sample";
export { benchmarkAuthorization } from "./benchmark/authorization";
export { UsageLog } from "./usage/log";
export { DebugLog } from "./usage/debug";
export { buildDashboardModel } from "./gui/dashboard";
export { mapProviderError } from "./server/errors";
export { parseResponsesRequest, parseChatRequest, parseAnthropicRequest, shapeResponsesResponse, shapeChatCompletionResponse, shapeAnthropicMessageResponse } from "./server/protocol";
export { runtimeOptionsFromEnvironment } from "./config/entrypoint";
