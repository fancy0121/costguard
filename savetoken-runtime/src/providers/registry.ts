export type ProviderCapability =
  | "responses"
  | "chat"
  | "anthropic"
  | "streaming"
  | "tools"
  | "images"
  | "vision"
  | "web-search";

export type ProviderAuthMode = "fixture" | "oauth" | "api-key" | "proxy" | "none";
export type ProviderHealth = "healthy" | "degraded" | "unavailable" | "unknown";

export type ProviderDescriptor = {
  id: string;
  models: string[];
  auth: ProviderAuthMode;
  health: ProviderHealth;
  tier?: SaveTokenTier;
  /** Immutable per-model routing tiers when a single proxy adapter exposes several routes. */
  modelTiers?: Readonly<Record<string, SaveTokenTier>>;
  capabilities: ProviderCapability[];
};

export type ProviderInvocationRequest = {
  requestedModel: string;
  protocol: Extract<ProviderCapability, "responses" | "chat" | "anthropic">;
  signal: AbortSignal;
  body?: Readonly<Record<string, unknown>>;
};

export type ProviderInvocationResult = {
  status: "PRESENT" | "UNKNOWN" | "NOT_TESTED" | "cancelled";
  actualRuntimeModel: "UNKNOWN" | string;
  response?: unknown;
  reason?: string;
};

export type ProviderAdapter = {
  descriptor: ProviderDescriptor;
  invoke: (request: ProviderInvocationRequest) => Promise<ProviderInvocationResult>;
  streamInvoke?: (request: ProviderInvocationRequest) => Promise<Response | null>;
};

export type ProviderStreamResult =
  | { status: "PRESENT"; response: Response }
  | { status: "UNKNOWN"; reason: string }
  | { status: "cancelled" };

export type ProviderRouteResolution = {
  status: "PRESENT" | "UNKNOWN" | "MISSING";
  provider?: string;
  model?: string;
  failClosed: boolean;
  reason?: string;
};

export class ProviderRegistry {
  private readonly adapters: Map<string, ProviderAdapter>;

  constructor(adapters: ProviderAdapter[]) {
    this.adapters = new Map();
    for (const adapter of adapters) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(adapter.descriptor.id)) throw new Error("provider-id-invalid");
      if (adapter.descriptor.models.some((model) => !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(model))) {
        throw new Error("provider-model-invalid");
      }
      if (adapter.descriptor.modelTiers) {
        const mapped = Object.keys(adapter.descriptor.modelTiers).sort();
        const models = [...adapter.descriptor.models].sort();
        if (mapped.length !== models.length || mapped.some((model, index) => model !== models[index])) {
          throw new Error("provider-model-tier-map-invalid");
        }
        if (adapter.descriptor.tier && Object.values(adapter.descriptor.modelTiers).some((tier) => tier !== adapter.descriptor.tier)) {
          throw new Error("provider-model-tier-conflict");
        }
      }
      if (this.adapters.has(adapter.descriptor.id)) throw new Error("provider-id-duplicate");
      this.adapters.set(adapter.descriptor.id, adapter);
    }
  }

  catalog(): ProviderDescriptor[] {
    return [...this.adapters.values()].map(({ descriptor }) => ({
      ...descriptor,
      models: [...descriptor.models],
      ...(descriptor.modelTiers ? { modelTiers: { ...descriptor.modelTiers } } : {}),
      capabilities: [...descriptor.capabilities],
    }));
  }

  descriptorFor(requestedModel: string): ProviderDescriptor | undefined {
    const slash = requestedModel.indexOf("/");
    if (slash <= 0 || slash === requestedModel.length - 1) return undefined;
    const provider = this.adapters.get(requestedModel.slice(0, slash));
    const model = requestedModel.slice(slash + 1);
    if (!provider?.descriptor.models.includes(model)) return undefined;
    return {
      ...provider.descriptor,
      models: [...provider.descriptor.models],
      ...(provider.descriptor.modelTiers ? { modelTiers: { ...provider.descriptor.modelTiers } } : {}),
      capabilities: [...provider.descriptor.capabilities],
    };
  }

  tierFor(requestedModel: string): SaveTokenTier | undefined {
    const descriptor = this.descriptorFor(requestedModel);
    if (!descriptor) return undefined;
    const model = requestedModel.slice(requestedModel.indexOf("/") + 1);
    return descriptor.modelTiers ? descriptor.modelTiers[model] : descriptor.tier;
  }

  resolve(requestedModel: string, protocol: ProviderInvocationRequest["protocol"]): ProviderRouteResolution {
    const slash = requestedModel.indexOf("/");
    if (slash <= 0 || slash === requestedModel.length - 1) {
      return { status: "MISSING", failClosed: true, reason: "provider-model-route-required" };
    }

    const providerId = requestedModel.slice(0, slash);
    const model = requestedModel.slice(slash + 1);
    const adapter = this.adapters.get(providerId);
    if (!adapter || !adapter.descriptor.models.includes(model)) {
      return { status: "UNKNOWN", failClosed: true, reason: "provider-or-model-unverified" };
    }
    if (adapter.descriptor.health === "unknown") {
      return { status: "UNKNOWN", failClosed: true, reason: "provider-health-unverified" };
    }
    if (adapter.descriptor.health === "unavailable") {
      return { status: "UNKNOWN", failClosed: true, reason: "provider-unavailable" };
    }
    if (!adapter.descriptor.capabilities.includes(protocol)) {
      return { status: "MISSING", failClosed: true, reason: "protocol-capability-missing" };
    }
    return { status: "PRESENT", provider: providerId, model, failClosed: false };
  }

  async invoke(request: ProviderInvocationRequest): Promise<ProviderInvocationResult> {
    if (request.signal.aborted) return { status: "cancelled", actualRuntimeModel: "UNKNOWN" };
    const resolution = this.resolve(request.requestedModel, request.protocol);
    if (resolution.status !== "PRESENT" || !resolution.provider) {
      return {
        status: "UNKNOWN",
        actualRuntimeModel: "UNKNOWN",
        reason: resolution.reason,
      };
    }
    const adapter = this.adapters.get(resolution.provider);
    if (!adapter) return { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "provider-adapter-missing" };
    try {
      const result = await adapter.invoke(request);
      if (request.signal.aborted) return { status: "cancelled", actualRuntimeModel: "UNKNOWN" };
      if (result.status === "PRESENT" && (result.actualRuntimeModel === "UNKNOWN" || result.actualRuntimeModel !== request.requestedModel)) {
        return { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "provider-evidence-unverified" };
      }
      return result;
    } catch {
      return { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "provider-adapter-failed" };
    }
  }

  async stream(request: ProviderInvocationRequest): Promise<ProviderStreamResult> {
    if (request.signal.aborted) return { status: "cancelled" };
    const resolution = this.resolve(request.requestedModel, request.protocol);
    if (resolution.status !== "PRESENT" || !resolution.provider) return { status: "UNKNOWN", reason: resolution.reason ?? "provider-route-unverified" };
    const adapter = this.adapters.get(resolution.provider);
    if (!adapter?.streamInvoke) return { status: "UNKNOWN", reason: "stream-unsupported" };
    try {
      const response = await adapter.streamInvoke(request);
      if (request.signal.aborted) return { status: "cancelled" };
      if (!response?.ok) return { status: "UNKNOWN", reason: "stream-failed" };
      if (!response.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) {
        return { status: "UNKNOWN", reason: "stream-content-type-invalid" };
      }
      return { status: "PRESENT", response };
    } catch {
      return { status: "UNKNOWN", reason: "stream-failed" };
    }
  }
}

export async function invokeWithFailover(
  registry: ProviderRegistry,
  routes: string[],
  input: Omit<ProviderInvocationRequest, "requestedModel"> & { tier: SaveTokenTier },
): Promise<ProviderInvocationResult & { fallbackUsed?: boolean; fallbackChain?: string[] }> {
  if (routes.length === 0) return { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "provider-route-empty" };
  const tiers = routes.map((route) => registry.tierFor(route));
  if (tiers.some((tier) => !tier)) return { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "provider-route-tier-unverified" };
  const minimumTier = input.tier === "sol" ? ["sol"] : input.tier === "terra" ? ["sol", "terra"] : ["sol", "terra", "execution"];
  if (input.tier !== "execution" && tiers.some((tier) => !minimumTier.includes(tier!))) {
    return { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "high-risk-provider-fallback-forbidden" };
  }
  const glmIndices = routes.flatMap((route, index) => registry.tierFor(route) === "glm-backup" ? [index] : []);
  if (glmIndices.length > 0 && routes.length > 1 && glmIndices[glmIndices.length - 1] !== routes.length - 1) {
    return { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "glm-backup-order-invalid" };
  }
  let last: ProviderInvocationResult = { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "provider-route-unverified" };
  const attempted: string[] = [];
  const unavailableExecutionRoutes = new Set<string>();
  for (let index = 0; index < routes.length; index += 1) {
    const routeTier = registry.tierFor(routes[index]);
    if (routeTier === "glm-backup") {
      const executionRoutes = [...new Set(routes.slice(0, index).filter((route) => registry.tierFor(route) === "execution"))];
      if (executionRoutes.length < 2 || executionRoutes.some((route) => !unavailableExecutionRoutes.has(route))) {
        return { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "glm-backup-prerequisite-unavailable" };
      }
    }
    attempted.push(routes[index]);
    const result = await registry.invoke({ requestedModel: routes[index], protocol: input.protocol, signal: input.signal, body: input.body });
    if (result.status === "PRESENT" || result.status === "cancelled") {
      return index === 0 ? { ...result, fallbackChain: [...attempted] } : { ...result, fallbackUsed: true, fallbackChain: [...attempted] };
    }
    last = result;
    if (input.tier !== "execution") {
      return routes.length === 1
        ? result
        : { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "high-risk-provider-fallback-forbidden" };
    }
    if (result.reason !== "provider-unavailable") return result;
    if (routeTier === "execution") unavailableExecutionRoutes.add(routes[index]);
  }
  return routes.length > 1 ? { ...last, fallbackUsed: true, fallbackChain: [...attempted] } : last;
}
import type { SaveTokenTier } from "../types";
