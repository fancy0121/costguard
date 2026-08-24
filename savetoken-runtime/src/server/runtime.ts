import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { atomicWriteOwnedJson, resolveHomes, isOwnedJson, type Environment } from "../config/homes";
import { resolveProviderModel } from "../providers/route";
import { invokeWithFailover, ProviderRegistry, type ProviderAdapter } from "../providers/registry";
import { parseResponsesRequest, parseChatRequest, parseAnthropicRequest, shapeResponsesResponse, shapeChatCompletionResponse, shapeAnthropicMessageResponse, validateChatToolContinuation, validateAnthropicToolContinuation } from "./protocol";
import { validateQualityContract, extractQualityContract } from "./quality";
import { ConversationStore } from "./conversation";
import { HealthState } from "./health";
import { cancellationTokenFor, type CancellationToken } from "./cancellation";
import { createManagementHandler, type ManagementLifecycleResult } from "./management";
import { restoreOwnedStateWithCodexProjection, uninstallOwnedStateWithCodexProjection } from "../config/lifecycle";
import { injectManagedCodexConfig, preflightManagedCodexConfig, recoverManagedCodexConfigJournal, restoreManagedCodexConfig } from "../config/codex-config";
import { projectCatalogToCodexHome, type CatalogEffort, type CatalogSnapshot } from "../codex/catalog";
import { UsageLog } from "../usage/log";
import { DebugLog } from "../usage/debug";
import { mapProviderError } from "./errors";
import type { SaveTokenTaskSignals, SaveTokenTier, RouteAdmissionEvidence } from "../types";
import { decideRoute, isTierAllowed } from "../routing/route";
import { SidecarFacade, type SidecarKind, type SidecarSession } from "../sidecars/capabilities";
import { ComboRouter, type ComboDefinition } from "../codex/policy";
import { parseSseText, type SseFrame } from "./sse";
import { classifyAnthropicSseFrame, classifyChatSseFrame, classifyResponsesSseFrame } from "./protocol";
import { discoverTrustedProxyModels, persistProxyDiscoveryCache, readProxyDiscoveryCache } from "../providers/discovery";
import { inspectRuntimeProcessState } from "../cli/process";

export type RuntimeOptions = {
  env: Environment;
  providers: Record<string, string[]>;
  beforeRoute?: (token: CancellationToken) => void | Promise<void>;
  managementToken?: string;
  restore?: () => Promise<ManagementLifecycleResult>;
  uninstall?: () => Promise<ManagementLifecycleResult>;
  providerAdapters?: ProviderAdapter[];
  /** Explicit default used only when callers omit model; insertion order is never routing policy. */
  defaultProvider?: string;
  /** Explicit loopback-only endpoint used solely by the authenticated model-discovery management action. */
  proxyDiscoveryBaseUrl?: string;
  providerTier?: SaveTokenTier;
  providerRoutes?: string[];
  /** Explicit, execution-only logical routes. No implicit combo discovery is allowed. */
  combos?: ComboDefinition[];
  /** Explicit catalog projection options; omitted fields never invent a subagent or injection choice. */
  catalog?: { selectedModels?: string[]; subagentModels?: string[]; injectionModel?: string; injectionEffort?: CatalogEffort };
  taskSignals?: (body: Record<string, unknown>) => SaveTokenTaskSignals | undefined;
  now?: () => number;
  providerCooldownMs?: number;
  sidecarFacade?: SidecarFacade;
  port?: number;
};

export type RuntimeHandle = {
  baseUrl: string;
  stop: () => void;
};

function json(value: unknown, status = 200, routeAdmission?: RouteAdmissionEvidence): Response {
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (routeAdmission) headers["x-savetoken-route-admission"] = JSON.stringify(routeAdmission);
  return Response.json(value, { status, headers });
}

function requestText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (typeof item !== "object" || item === null) return "";
    const record = item as Record<string, unknown>;
    if (typeof record.content === "string") return record.content;
    if (Array.isArray(record.content)) return requestText(record.content);
    if (typeof record.text === "string") return record.text;
    return "";
  }).join(" ");
}

function inferredTaskText(body: Record<string, unknown>): { text: string; explicit: boolean } {
  if (typeof body.savetokenTask === "string") return { text: body.savetokenTask, explicit: true };
  const text = typeof body.input === "string" ? body.input : requestText(body.input ?? body.messages);
  return { text, explicit: false };
}

function taskTextHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

/** Preserve upstream bytes while appending only a redacted failure when an otherwise successful fixture stream ends without a terminal. */
function completedResponsesToolCalls(frames: SseFrame[]): { responseId: string; callIds: string[] } | undefined {
  let responseId: string | undefined;
  const callIds: string[] = [];
  for (const frame of frames) {
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(frame.data) as Record<string, unknown>; } catch { continue; }
    if (parsed.type === "response.created" && typeof (parsed.response as { id?: unknown } | undefined)?.id === "string") {
      responseId = (parsed.response as { id: string }).id;
    }
    if (parsed.type === "response.output_item.done" && typeof parsed.item === "object" && parsed.item !== null) {
      const item = parsed.item as Record<string, unknown>;
      if (item.type === "function_call" && typeof item.call_id === "string" && item.call_id) callIds.push(item.call_id);
    }
  }
  return responseId && callIds.length > 0 ? { responseId, callIds: [...new Set(callIds)] } : undefined;
}

function guardSseTerminal(
  body: ReadableStream<Uint8Array> | null,
  protocol: "responses" | "chat" | "anthropic",
  signal: AbortSignal,
  onResponsesCompleted?: (responseId: string, callIds: string[]) => void,
): ReadableStream<Uint8Array> | null {
  if (!body) return body;
  const maxInspectionBytes = 256 * 1024;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let source = "";
  let inspectedBytes = 0;
  let inspectionExceeded = false;
  const terminal = (frame: { event?: string; data: string }) => protocol === "responses"
    ? classifyResponsesSseFrame(frame)
    : protocol === "chat"
      ? classifyChatSseFrame({ data: frame.data })
      : classifyAnthropicSseFrame(frame);
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (!inspectionExceeded) {
        inspectedBytes += chunk.byteLength;
        if (inspectedBytes > maxInspectionBytes) inspectionExceeded = true;
        else source += decoder.decode(chunk, { stream: true });
      }
      controller.enqueue(chunk);
    },
    flush(controller) {
      if (!inspectionExceeded) source += decoder.decode();
      if (signal.aborted) return;
      if (inspectionExceeded) {
        controller.enqueue(encoder.encode('event: error\ndata: {"status":"UNKNOWN","failClosed":true,"reason":"stream-inspection-limit-exceeded"}\n\n'));
        return;
      }
      const frames = parseSseText(source);
      const states = frames.map(terminal);
      if (!states.some((state) => state === "completed" || state === "failed" || state === "cancelled")) {
        controller.enqueue(encoder.encode('event: error\ndata: {"status":"UNKNOWN","failClosed":true,"reason":"stream-terminal-missing"}\n\n'));
      } else if (protocol === "responses" && states.some((state) => state === "completed")) {
        const calls = completedResponsesToolCalls(frames);
        if (calls) onResponsesCompleted?.(calls.responseId, calls.callIds);
      }
    },
  }));
}

export async function startRuntime(options: RuntimeOptions): Promise<RuntimeHandle> {
  const conversationStore = new ConversationStore();
  const homes = resolveHomes(options.env);
  const runtimeState = { codexHome: homes.codexHome, saveTokenHome: homes.saveTokenHome, openCodexHome: homes.openCodexHome, providerCount: Object.keys(options.providers).length };

  const health = new HealthState();
  const verifiedProvider = options.providerAdapters?.some((adapter) => {
    if (adapter.descriptor.auth === "proxy") return false;
    if (adapter.descriptor.health !== "healthy") return false;
    const configuredModels = options.providers[adapter.descriptor.id];
    if (!configuredModels) return false;
    return configuredModels.some((model) => adapter.descriptor.models.includes(model));
  }) ?? false;
  if (verifiedProvider) health.markReady();
  else health.markFailed("provider-health-unverified");
  const defaultProvider = options.defaultProvider ?? "";
  if (defaultProvider && !Object.hasOwn(options.providers, defaultProvider)) throw new Error("provider-default-unconfigured");
  const telemetryRoot = join(homes.saveTokenHome, "telemetry");
  const usagePath = join(telemetryRoot, "usage.json");
  const debugPath = join(telemetryRoot, "debug.json");
  const discoveryCachePath = join(homes.saveTokenHome, "provider-discovery.json");
  let usageLog: UsageLog;
  let debugLog: DebugLog;
  try {
    usageLog = await UsageLog.load(usagePath);
    debugLog = await DebugLog.load(debugPath);
  } catch {
    throw new Error("telemetry-state-unverified");
  }
  await atomicWriteOwnedJson(join(homes.saveTokenHome, "runtime.json"), runtimeState);
  const persistTelemetry = async (): Promise<void> => {
    await usageLog.persist(usagePath);
    await debugLog.persist(debugPath);
  };
  const providerRegistry = options.providerAdapters ? new ProviderRegistry(options.providerAdapters) : undefined;
  const now = options.now ?? Date.now;
  const providerCooldownMs = options.providerCooldownMs ?? 60_000;
  const providerObservations = new Map<string, { lastSuccessAt?: string; lastFailureAt?: string; lastFailureReason?: string; availability?: "available" | "unavailable" | "unknown"; cooldownUntil?: number }>();
  const configuredProviderRoutes = () => (providerRegistry?.catalog() ?? []).flatMap((descriptor) =>
    descriptor.models
      .filter((model) => options.providers[descriptor.id]?.includes(model) ?? false)
      .map((model) => ({ route: `${descriptor.id}/${model}`, descriptor })),
  );
  const configuredRouteSet = new Set<string>(Object.entries(options.providers).flatMap(([provider, models]) => models.map((model) => `${provider}/${model}`)));
  const catalogSnapshot = (): CatalogSnapshot => ({
    version: 1,
    selectedModels: options.catalog?.selectedModels ? [...options.catalog.selectedModels] : [...configuredRouteSet],
    subagentModels: options.catalog?.subagentModels ? [...options.catalog.subagentModels] : [],
    ...(options.catalog?.injectionModel !== undefined ? { injectionModel: options.catalog.injectionModel } : {}),
    ...(options.catalog?.injectionEffort !== undefined ? { injectionEffort: options.catalog.injectionEffort } : {}),
    combos: (options.combos ?? []).map((combo) => ({ id: combo.id, aliases: combo.aliases ? [...combo.aliases] : undefined, strategy: combo.strategy, tier: combo.tier, routes: combo.targets.map((target) => target.route) })),
  });
  const configuredRouteTiers = Object.fromEntries(
    configuredProviderRoutes()
      .map(({ route }) => [route, providerRegistry?.tierFor(route)] as const)
      .filter((entry) => entry[1] !== undefined),
  ) as Record<string, SaveTokenTier>;
  const comboRouter = options.combos ? new ComboRouter(options.combos, configuredRouteSet, configuredRouteTiers) : undefined;
  const routeAvailability = (route: string): "available" | "unavailable" | "unknown" => {
    const observed = providerObservations.get(route);
    if (observed?.cooldownUntil !== undefined && observed.cooldownUntil > now()) return "unavailable";
    if (observed?.availability) return observed.availability;
    const descriptor = providerRegistry?.descriptorFor(route);
    if (!descriptor) return "unknown";
    if (descriptor.health === "healthy" || descriptor.health === "degraded") return "available";
    return descriptor.health;
  };
  let lifecycleTail: Promise<void> = Promise.resolve();
  async function serializeLifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const previous = lifecycleTail;
    let release: () => void = () => undefined;
    lifecycleTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }
  const runtimeReady = () => {
    const base = health.ready();
    if (base.status !== "ready") return base;
    const routes = configuredProviderRoutes();
    if (routes.length === 0) return { status: "failed" as const, reason: "provider-health-unverified" };
    const usable = routes.some(({ route, descriptor }) => {
      const observed = providerObservations.get(route);
      const cooling = observed?.cooldownUntil !== undefined && observed.cooldownUntil > now();
      const availability = cooling ? "unavailable" : observed?.availability ?? (descriptor.auth === "proxy" ? "unknown" : (descriptor.health === "healthy" || descriptor.health === "degraded" ? "available" : descriptor.health));
      return availability === "available";
    });
    return usable ? base : { status: "failed" as const, reason: "provider-runtime-unavailable" };
  };
  const providerControlPlane = () => ({ data: configuredProviderRoutes().map(({ route, descriptor }) => {
    const observed = providerObservations.get(route);
    const cooling = observed?.cooldownUntil !== undefined && observed.cooldownUntil > now();
    const availability = cooling ? "unavailable" : observed?.availability ?? (descriptor.auth === "proxy" ? "unknown" : (descriptor.health === "healthy" || descriptor.health === "degraded" ? "available" : descriptor.health));
    const source = observed?.lastSuccessAt ? "recent-success" : observed?.lastFailureAt ? "recent-failure" : "descriptor";
    return { route, availability, source, ...(observed?.lastSuccessAt ? { lastSuccessAt: observed.lastSuccessAt } : {}), ...(observed?.lastFailureAt ? { lastFailureAt: observed.lastFailureAt } : {}), ...(observed?.lastFailureReason ? { lastFailureReason: observed.lastFailureReason } : {}), ...(cooling ? { cooldownUntil: new Date(observed!.cooldownUntil!).toISOString() } : {}) };
  }) });
  const management = createManagementHandler({
    managementToken: options.managementToken,
    health: () => health.health(),
    ready: runtimeReady,
    catalog: () => ({
      object: "list",
      data: providerRegistry
        ? configuredProviderRoutes().map(({ route, descriptor }) => ({ id: route, provider: descriptor.id }))
        : Object.entries(options.providers).flatMap(([provider, models]) => models.map((model) => ({ id: provider + "/" + model, provider }))),
    }),
    providers: providerControlPlane,
    usage: () => usageLog.summary(),
    logs: () => debugLog.entries(),
    modelDiscovery: async () => {
      if (!options.proxyDiscoveryBaseUrl) return { status: "UNKNOWN", failClosed: true, reason: "model-discovery-not-configured" };
      const cache = await readProxyDiscoveryCache(discoveryCachePath);
      if (cache.status === "UNKNOWN") return cache;
      const discovered = await discoverTrustedProxyModels({ baseUrl: options.proxyDiscoveryBaseUrl, configuredRoutes: Object.entries(options.providers).flatMap(([provider, models]) => models.map((model) => `${provider}/${model}`)) });
      if (discovered.status !== "PRESENT") return discovered;
      const persisted = await persistProxyDiscoveryCache(discoveryCachePath, discovered, new Date(now()).toISOString());
      return persisted.status === "PRESENT" ? discovered : persisted;
    },
    modelDiscoveryCache: () => readProxyDiscoveryCache(discoveryCachePath),
    restore: options.restore ?? (() => serializeLifecycle(async () => {
      const config = await restoreManagedCodexConfig(homes.codexHome, homes.saveTokenHome);
      if (config.status === "UNKNOWN") return config;
      const projection = await restoreOwnedStateWithCodexProjection(homes.saveTokenHome, homes.codexHome);
      if (projection.status === "UNKNOWN") return projection;
      if (config.status === "PRESENT" || projection.status === "PRESENT") return { status: "PRESENT" as const };
      return { status: "MISSING" as const, reason: "no-owned-state" };
    })),
    uninstall: options.uninstall ?? (() => serializeLifecycle(async () => {
      const config = await restoreManagedCodexConfig(homes.codexHome, homes.saveTokenHome);
      if (config.status === "UNKNOWN") return config;
      const projection = await uninstallOwnedStateWithCodexProjection(homes.saveTokenHome, homes.codexHome);
      if (projection.status === "UNKNOWN") return projection;
      if (config.status === "PRESENT" || projection.status === "PRESENT") return { status: "PRESENT" as const, removed: projection.status === "PRESENT" ? projection.removed : 0 };
      return { status: "MISSING" as const, reason: "no-owned-state" };
    })),
    install: () => serializeLifecycle(async () => {
      const statePath = join(homes.saveTokenHome, "installed.json");
      const configBaseUrl = `http://127.0.0.1:${server.port}`;
      const recovered = await recoverManagedCodexConfigJournal(homes.codexHome, homes.saveTokenHome);
      if (recovered.status === "UNKNOWN") return recovered;
      const configPreflight = await preflightManagedCodexConfig(homes.codexHome, homes.saveTokenHome, configBaseUrl);
      if (configPreflight.status !== "PRESENT") return configPreflight;
      const snapshot = catalogSnapshot();
      const projection = await projectCatalogToCodexHome(homes.codexHome, snapshot, options.providers);
      if (projection.status !== "PRESENT") return { status: "UNKNOWN" as const, reason: projection.reason };
      const config = await injectManagedCodexConfig(homes.codexHome, homes.saveTokenHome, configBaseUrl);
      if (config.status !== "PRESENT") return config;
      if (!(await isOwnedJson(statePath))) {
        await atomicWriteOwnedJson(statePath, { installed: true, installedAt: new Date().toISOString(), codexCatalog: projection.path });
      }
      return { status: "PRESENT" as const };
    }),
    sync: () => serializeLifecycle(async () => {
      const statePath = join(homes.saveTokenHome, "installed.json");
      if (!(await isOwnedJson(statePath))) return { status: "MISSING" as const, reason: "not-installed" };
      const configBaseUrl = `http://127.0.0.1:${server.port}`;
      const recovered = await recoverManagedCodexConfigJournal(homes.codexHome, homes.saveTokenHome);
      if (recovered.status === "UNKNOWN") return recovered;
      const configPreflight = await preflightManagedCodexConfig(homes.codexHome, homes.saveTokenHome, configBaseUrl);
      if (configPreflight.status !== "PRESENT") return configPreflight;
      const snapshot = catalogSnapshot();
      const projection = await projectCatalogToCodexHome(homes.codexHome, snapshot, options.providers);
      if (projection.status !== "PRESENT") return { status: "UNKNOWN" as const, reason: projection.reason };
      const config = await injectManagedCodexConfig(homes.codexHome, homes.saveTokenHome, configBaseUrl);
      if (config.status !== "PRESENT") return config;
      await atomicWriteOwnedJson(join(homes.saveTokenHome, "runtime.json"), runtimeState);
      return { status: "PRESENT" as const };
    }),
    doctor: async () => {
      const findings: string[] = [];
      // Check journal residue
      const journalPath = join(homes.saveTokenHome, ".savetoken-owned-batch.json");
      try { await readFile(journalPath, "utf8"); findings.push("journal-residue"); } catch {}
      // Check runtime state
      const statePath = join(homes.saveTokenHome, "runtime.json");
      if (await isOwnedJson(statePath)) findings.push("runtime-state-present");
      else findings.push("runtime-state-missing-or-unowned");
      const processState = await inspectRuntimeProcessState(homes.saveTokenHome);
      if (processState === "stale") findings.unshift("runtime-process-state-stale");
      if (processState === "unverified") findings.unshift("runtime-process-state-unverified");
      const stalePid = processState === "stale";
      const unknown = findings.includes("journal-residue") || stalePid || processState === "unverified";
      return { status: unknown ? "UNKNOWN" as const : "PRESENT" as const, findings, ...(stalePid ? { stalePid: true } : {}) };
    },
  });

  function analyzeRoute(body: Record<string, unknown>, taskSignalsFn?: (body: Record<string, unknown>) => SaveTokenTaskSignals | undefined) {
    const task = inferredTaskText(body);
    const hash = taskTextHash(task.text);
    let trustedSignals: SaveTokenTaskSignals | undefined;
    let signalSource: RouteAdmissionEvidence["signalSource"] = "unavailable";
    try { trustedSignals = taskSignalsFn?.(body); if (trustedSignals && typeof trustedSignals.text === "string") signalSource = "structured"; else trustedSignals = undefined; } catch { /* keep unavailable */ }
    const decision = trustedSignals ? decideRoute({ ...trustedSignals, text: trustedSignals.text || task.text }) : task.text ? decideRoute({ text: task.text }) : undefined;
    return { hash, signalSource, decision };
  }

  function admitRoute(analysis: ReturnType<typeof analyzeRoute>, providerTier: SaveTokenTier): { evidence: RouteAdmissionEvidence; decision?: ReturnType<typeof decideRoute> } {
    const { hash, signalSource, decision } = analysis;
    return { evidence: { decidedAt: new Date().toISOString(), decidingTier: providerTier, requestedTier: decision?.tier, selectedProviderTier: providerTier, escalationReasons: decision?.escalationReasons ?? [], signalSource, taskTextHash: hash }, decision };
  }

  const server = Bun.serve<{ session: SidecarSession }>({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    async fetch(request) {
      const url = new URL(request.url);
      const managed = await management(request);
      if (managed) return managed;
      if (url.pathname === "/healthz" && request.method === "GET") {
        const state = health.health();
        return json(state, state.status === "healthy" ? 200 : 503);
      }
      if (url.pathname === "/readyz" && request.method === "GET") {
        const state = runtimeReady();
        return json(state, state.status === "ready" ? 200 : 503);
      }
      if (url.pathname === "/v1/models" && request.method === "GET") {
        const data = Object.entries(options.providers).flatMap(([provider, models]) => models.map((model) => ({ id: provider + "/" + model, provider })));
        return json({ object: "list", data });
      }
      const sidecarMatch = /^\/v1\/sidecars\/(images|vision|web-search)$/.exec(url.pathname);
      if (sidecarMatch) {
        const socketProtocols = request.headers.get("sec-websocket-protocol")?.split(",").map((item) => item.trim()) ?? [];
        const authorizedSidecar = request.headers.get("authorization") === `Bearer ${options.managementToken ?? ""}` || socketProtocols.includes(options.managementToken ?? "");
        if (!options.sidecarFacade || !authorizedSidecar) return json({ status: "UNKNOWN", failClosed: true, reason: "sidecar-authorization-required" }, 401);
        const connection = options.sidecarFacade.connect(sidecarMatch[1] as SidecarKind);
        if (connection.status !== "PRESENT") return json(connection, 503);
        if (server.upgrade(request, { data: { session: connection.session } })) return undefined;
        return json({ status: "UNKNOWN", failClosed: true, reason: "websocket-upgrade-required" }, 426);
      }

      const isResponses = url.pathname === "/v1/responses" && request.method === "POST";
      const isChat = url.pathname === "/v1/chat/completions" && request.method === "POST";
      const isAnthropic = url.pathname === "/v1/messages" && request.method === "POST";
      if (!isResponses && !isChat && !isAnthropic) return json({ error: "not-found" }, 404);

      const cancellation = cancellationTokenFor(request.signal);
      const cancelled = () => json({ status: "cancelled", failClosed: true, actualRuntimeModel: "UNKNOWN" }, 499);
      try {
        if (cancellation.token.cancelled) return cancelled();
        let body: Record<string, unknown>;
        try { body = await request.json() as Record<string, unknown>; } catch { if (cancellation.token.cancelled) return cancelled();

 return json({ status: "UNKNOWN", failClosed: true, reason: "invalid-json" }, 400); }
        if (cancellation.token.cancelled) return cancelled();

        const requestedModel = typeof body.model === "string" ? body.model : undefined;
        const analysis = analyzeRoute(body, options.taskSignals);
        let route;
        let logicalComboId: string | undefined;
        let comboRoutes: string[] | undefined;
        if (requestedModel && comboRouter?.accepts(requestedModel)) {
          const combo = comboRouter.resolve(requestedModel, routeAvailability);
          if (combo.status !== "PRESENT") return json({ ...combo, routeAdmission: undefined }, 503);
          logicalComboId = combo.id;
          comboRoutes = combo.routes;
          route = resolveProviderModel({ defaultProvider, providers: options.providers, requestedModel: combo.routes[0] });
        } else if (requestedModel) {
          route = resolveProviderModel({ defaultProvider, providers: options.providers, requestedModel });
        } else {
          const decision = analysis.decision;
          if (!decision || (decision.tier === "execution" && analysis.signalSource !== "structured")) {
            return json({ status: "UNKNOWN", failClosed: true, reason: "trusted-execution-signals-required" }, 503);
          }
          const matches = Object.entries(options.providers).flatMap(([provider, models]) => models
            .filter((model) => decision.candidates.includes(model))
            .map((model) => ({ provider, model })));
          if (matches.length !== 1) return json({ status: "UNKNOWN", failClosed: true, reason: "automatic-route-unverified" }, 503);
          route = { status: "PRESENT" as const, provider: matches[0].provider, model: matches[0].model, failClosed: false };
        }
        if (route.status !== "PRESENT" || !route.provider || !route.model) return json({ ...route, status: "UNKNOWN", failClosed: true }, 503);
        await options.beforeRoute?.(cancellation.token);
        if (cancellation.token.cancelled) return cancelled();

        const requestedRoute = route.provider + "/" + route.model;
        const routeTier = providerRegistry?.tierFor(requestedRoute) ?? options.providerTier;
        if (!routeTier) return json({ status: "UNKNOWN", failClosed: true, reason: "provider-tier-unverified" }, 503);
        const { evidence, decision } = admitRoute(analysis, routeTier);
        if (logicalComboId) evidence.logicalComboId = logicalComboId;
        const requiredTier = decision?.tier;
        if (requiredTier === "execution" && analysis.signalSource !== "structured") {
          return json({ status: "UNKNOWN", failClosed: true, reason: "trusted-execution-signals-required", routeAdmission: evidence }, 503);
        }
        if (requiredTier && !isTierAllowed(requiredTier, routeTier)) {
          return json({ status: "UNKNOWN", failClosed: true, reason: "task-tier-candidate-mismatch", routeAdmission: evidence }, 503);
        }

        if (!providerRegistry) {
          usageLog.append({ provider: route.provider, model: route.model, outcome: "NOT_TESTED" });
          await persistTelemetry();
          return json({ status: "NOT_TESTED", resolvedProvider: route.provider, resolvedModel: route.model, actualRuntimeModel: "UNKNOWN", evidenceValid: false, failClosed: true, reason: "provider-adapter-not-configured", routeAdmission: evidence }, 503);
        }

        const observed = providerObservations.get(route.provider + "/" + route.model);
        if (observed?.cooldownUntil !== undefined && observed.cooldownUntil > now()) {
          return json({ status: "UNKNOWN", failClosed: true, reason: "provider-cooldown", routeAdmission: evidence }, 503);
        }

                        // Multi-turn tool validation
        const prevResponseId = typeof body.previous_response_id === "string" ? body.previous_response_id : undefined;
        const toolValidation = conversationStore.validateToolResultInput(prevResponseId, body.input);
        if (!toolValidation.valid) {
          return json({ status: "UNKNOWN", failClosed: true, reason: toolValidation.reason, routeAdmission: evidence }, 422);
        }
        const transcriptValidation = isChat
          ? validateChatToolContinuation(body.messages)
          : isAnthropic
            ? validateAnthropicToolContinuation(body.messages)
            : { valid: true as const };
        if (!transcriptValidation.valid) {
          return json({ status: "UNKNOWN", failClosed: true, reason: transcriptValidation.reason, routeAdmission: evidence }, 422);
        }

        const kind = isResponses ? "responses" : isAnthropic ? "anthropic" : "chat";
        const candidateRoutes = comboRoutes ?? [requestedRoute, ...(options.providerRoutes ?? []).filter((c) => c !== requestedRoute)];
        let pureBody: Record<string, unknown>;
        if (isResponses) {
          const { validation } = parseResponsesRequest(body);
          if (!validation.valid) return json({ status: "UNKNOWN", failClosed: true, reason: validation.reason, routeAdmission: evidence }, 400);
          pureBody = parseResponsesRequest(body).normalized.pureBody;
        } else if (isChat) {
          const { validation } = parseChatRequest(body);
          if (!validation.valid) return json({ status: "UNKNOWN", failClosed: true, reason: validation.reason, routeAdmission: evidence }, 400);
          pureBody = parseChatRequest(body).normalized.pureBody;
        } else {
          const { validation } = parseAnthropicRequest(body);
          if (!validation.valid) return json({ status: "UNKNOWN", failClosed: true, reason: validation.reason, routeAdmission: evidence }, 400);
          pureBody = parseAnthropicRequest(body).normalized.pureBody;
        }
        if (!requestedModel || logicalComboId) pureBody = { ...pureBody, model: requestedRoute };

        const qualityContract = extractQualityContract(body);
        if (qualityContract && "invalid" in qualityContract) {
          debugLog.append({ event: "quality.failed", status: "UNKNOWN" });
          await persistTelemetry();
          return json({ status: "UNKNOWN", failClosed: true, reason: qualityContract.reason, routeAdmission: evidence }, 422);
        }
        if (body.stream === true && qualityContract) {
          debugLog.append({ event: "quality.failed", status: "UNKNOWN" });
          await persistTelemetry();
          return json({ status: "UNKNOWN", failClosed: true, reason: "stream-quality-contract-unverified", routeAdmission: evidence }, 422);
        }

        if (cancellation.token.cancelled) return cancelled();

        // Streaming SSE passthrough
        if (body.stream === true && providerRegistry) {
          if (providerRegistry.descriptorFor(requestedRoute)?.auth === "proxy") {
            return json({ status: "UNKNOWN", failClosed: true, reason: "stream-terminal-identity-unverified", routeAdmission: evidence }, 422);
          }
          const streamed = await providerRegistry.stream({ requestedModel: requestedRoute, protocol: kind, signal: request.signal, body: pureBody });
          if (streamed.status === "cancelled") return cancelled();
          if (streamed.status !== "PRESENT") {
            const status = streamed.reason === "stream-unsupported" ? 422 : streamed.reason === "provider-unavailable" ? 503 : 502;
            return json({ status: "UNKNOWN", failClosed: true, reason: streamed.reason, routeAdmission: evidence }, status);
          }
          return new Response(guardSseTerminal(streamed.response.body, kind, request.signal, isResponses
            ? (responseId, callIds) => { for (const callId of callIds) conversationStore.recordIssuedCall(responseId, callId); }
            : undefined), { status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-store", "x-savetoken-route-admission": JSON.stringify(evidence) } });
        }

        const invocation = await invokeWithFailover(providerRegistry, candidateRoutes, { protocol: kind, signal: request.signal, body: pureBody, tier: decision?.tier ?? routeTier });
        if (invocation.status === "cancelled") return cancelled();
        if (invocation.status !== "PRESENT") {
          const reason = invocation.reason ?? "provider-request-failed";
          const unavailable = reason === "provider-unavailable" || reason === "provider-rate-limited" || reason === "provider-auth-failed" || reason === "provider-forbidden";
          providerObservations.set(route.provider + "/" + route.model, {
            lastFailureAt: new Date(now()).toISOString(),
            lastFailureReason: reason,
            availability: unavailable ? "unavailable" : "unknown",
            ...(reason === "provider-rate-limited" ? { cooldownUntil: now() + providerCooldownMs } : {}),
          });
          const mappedStatus = reason === "provider-rate-limited" ? 429 : reason === "provider-unavailable" ? 503 : 502;
          const mapped = mapProviderError({ status: mappedStatus });
          return json({ ...mapped, failClosed: true, reason: invocation.reason, routeAdmission: evidence }, mapped.httpStatus);
        }
        const actualRoute = invocation.actualRuntimeModel;
        const actualSlash = actualRoute.indexOf("/");
        const actualProvider = actualSlash > 0 ? actualRoute.slice(0, actualSlash) : route.provider;
        const actualModel = actualSlash > 0 ? actualRoute.slice(actualSlash + 1) : route.model;
        providerObservations.set(actualRoute, { lastSuccessAt: new Date(now()).toISOString(), availability: "available" });
        health.markReady();
        if (logicalComboId) comboRouter?.recordSuccess(logicalComboId, actualRoute);
        usageLog.append({ provider: actualProvider, model: actualModel, outcome: "PRESENT" });

        if (qualityContract) {
          const qr = validateQualityContract(qualityContract, invocation.response, kind);
          if (!qr.valid) {
            debugLog.append({ event: "quality.failed", status: "UNKNOWN" });
            await persistTelemetry();
            return json({ status: "UNKNOWN", failClosed: true, reason: qr.reason, routeAdmission: evidence }, 422);
          }
        }
        if (isResponses) {
          debugLog.append({ event: "responses.completed", status: "PRESENT" });
          await persistTelemetry();
          const outputFromResponse = (() => { const r = invocation.response; if (typeof r === "object" && r !== null && Array.isArray((r as Record<string, unknown>).output)) return (r as Record<string, unknown>).output as Array<Record<string, unknown>>; if (Array.isArray(r)) return r as Array<Record<string, unknown>>; return [{ text: r ? String(r) : "" }]; })();
          const actualUsage = (() => { const r = invocation.response; if (typeof r === "object" && r !== null && typeof (r as Record<string, unknown>).usage === "object") return (r as Record<string, unknown>).usage; return undefined; })();
          const actualReasoning = (() => { const r = invocation.response; if (typeof r === "object" && r !== null && typeof (r as Record<string, unknown>).reasoning === "object") return (r as Record<string, unknown>).reasoning; return undefined; })();
          const resp = { ...shapeResponsesResponse({ model: actualRoute, status: "completed", output: outputFromResponse }), ...(actualUsage ? { usage: actualUsage } : {}), ...(actualReasoning ? { reasoning: actualReasoning } : {}) };
                    const fcs = outputFromResponse.filter((o: any) => o.type === "function_call" && typeof o.call_id === "string");
          for (const fc of fcs) conversationStore.recordIssuedCall(
            String(resp.id),
            String(fc.call_id),
            typeof fc.name === "string" ? fc.name : undefined,
          );
          return json(resp, 200, evidence);
        }
        if (isChat) {
          debugLog.append({ event: "chat.completed", status: "PRESENT" });
          await persistTelemetry();
          if (typeof invocation.response === "object" && invocation.response !== null) {
            const upstream = invocation.response as Record<string, unknown>;
            if (upstream.object === "chat.completion" && Array.isArray(upstream.choices)) {
              return json({ ...upstream, model: actualRoute }, 200, evidence);
            }
          }
          const resp = shapeChatCompletionResponse({ model: actualRoute, finishReason: "stop", content: typeof invocation.response === "string" ? invocation.response : invocation.response ? JSON.stringify(invocation.response) : null });
          return json(resp, 200, evidence);
        }
        debugLog.append({ event: "anthropic.completed", status: "PRESENT" });
        await persistTelemetry();
        if (typeof invocation.response === "object" && invocation.response !== null) {
          const upstream = invocation.response as Record<string, unknown>;
          if (upstream.type === "message" && Array.isArray(upstream.content)) {
            return json({ ...upstream, model: actualRoute }, 200, evidence);
          }
        }
        const resp = shapeAnthropicMessageResponse({ model: actualRoute, stopReason: "end_turn", content: [{ type: "text", text: "" }] });
        return json(resp, 200, evidence);
      } finally {
        cancellation.dispose();
      }
    },
    websocket: {
    async message(ws, message) {
      let decoded: unknown;
      try { decoded = JSON.parse(String(message)); } catch { ws.send(JSON.stringify({ status: "UNKNOWN", failClosed: true, reason: "sidecar-message-invalid" })); ws.close(4400, "invalid"); return; }
      if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) { ws.send(JSON.stringify({ status: "UNKNOWN", failClosed: true, reason: "sidecar-message-invalid" })); ws.close(4400, "invalid"); return; }
      ws.send(JSON.stringify(await ws.data.session.send(decoded)));
    },
    close(ws) { ws.data.session.cancel(); },
    },
  });

  const baseUrl = server.url.toString().replace(/\/$/, "");
  await atomicWriteOwnedJson(join(homes.saveTokenHome, "runtime.json"), { ...runtimeState, baseUrl });
  return { baseUrl, stop: () => server.stop() };
}
