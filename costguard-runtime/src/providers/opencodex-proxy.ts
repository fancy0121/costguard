import type { ProviderAdapter, ProviderDescriptor, ProviderInvocationRequest, ProviderInvocationResult } from "./registry";
import type { CostGuardTier } from "../types";
import { parseSseText } from "../server/sse";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export type OpenCodexProxyOptions = { baseUrl: string; path?: string; timeoutMs?: number };
export type ProxyModelEntry = { providerId: string; modelId: string; tier: CostGuardTier; capabilities?: string[] };

class ProxyTimeoutError extends Error {
  constructor() { super("proxy-request-timeout"); }
}

const FROZEN_MODELS: ProxyModelEntry[] = [
  { providerId: "openai", modelId: "gpt-5.6-sol", tier: "sol", capabilities: ["responses", "chat", "anthropic"] },
  { providerId: "openai", modelId: "gpt-5.6-terra", tier: "terra", capabilities: ["responses", "chat", "anthropic"] },
  { providerId: "openai", modelId: "gpt-5.6-luna", tier: "execution", capabilities: ["responses", "chat", "anthropic"] },
  { providerId: "deepseek", modelId: "deepseek-v4-flash", tier: "execution", capabilities: ["responses"] },
  { providerId: "zhipu-bigmodel", modelId: "glm-5.2", tier: "glm-backup", capabilities: ["responses", "chat"] },
];

function validateOptions(o: OpenCodexProxyOptions) {
  let base: URL;
  try { base = new URL(o.baseUrl); } catch { throw new Error("opencodex-proxy-base-url-invalid"); }
  if (!LOOPBACK_HOSTS.has(base.hostname)) throw new Error("opencodex-proxy-loopback-only");
  if (base.protocol !== "http:" || base.pathname !== "/" || base.username || base.password || base.search || base.hash) {
    throw new Error("opencodex-proxy-base-url-shape-invalid");
  }
  if (o.timeoutMs !== undefined && (!Number.isFinite(o.timeoutMs) || o.timeoutMs <= 0)) throw new Error("opencodex-proxy-timeout-invalid");
  if (o.path && !["/v1/responses", "/v1/chat/completions", "/v1/messages"].includes(o.path)) throw new Error("opencodex-proxy-path-invalid");
}

async function fetchTrustedProxy(url: string, body: Record<string, unknown>, signal: AbortSignal, timeoutMs?: number): Promise<Response> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  signal.addEventListener("abort", abortFromCaller, { once: true });
  let timedOut = false;
  const timeout = timeoutMs === undefined ? undefined : setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new ProxyTimeoutError();
    throw error;
  } finally {
    signal.removeEventListener("abort", abortFromCaller);
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function bodyFor(providerId: string, protocol: ProviderInvocationRequest["protocol"], raw: Record<string, unknown>): Record<string, unknown> {
  if (providerId === "openai" && protocol === "responses") {
    const input = typeof raw.input === "string" ? [{ role: "user", content: raw.input }] : raw.input;
    return { ...raw, input, store: false, stream: true };
  }
  return raw;
}

function pathFor(protocol: ProviderInvocationRequest["protocol"], options: OpenCodexProxyOptions): string {
  if (options.path) return options.path;
  return protocol === "chat" ? "/v1/chat/completions" : protocol === "anthropic" ? "/v1/messages" : "/v1/responses";
}

function redactedHttpFailure(status: number): ProviderInvocationResult["reason"] {
  if (status === 401) return "provider-auth-failed";
  if (status === 403) return "provider-forbidden";
  if (status === 429) return "provider-rate-limited";
  if (status === 503) return "provider-unavailable";
  return "provider-request-failed";
}

/** Aggregate safe OpenAI Responses SSE fields into the normalized provider result. */
export function parseOpenAiResponsesSse(source: string): { model?: string; usage?: unknown; output: Array<Record<string, unknown>> } {
  let model: string | undefined;
  let usage: unknown;
  let completedOutput: Array<Record<string, unknown>> | undefined;
  let completedItems: Array<Record<string, unknown>> = [];
  let text = "";
  for (const frame of parseSseText(source)) {
    if (frame.data === "[DONE]") continue;
    try {
      const event = JSON.parse(frame.data) as Record<string, unknown>;
      const type = typeof event.type === "string" ? event.type : frame.event;
      if (type === "response.output_text.delta" && typeof event.delta === "string") text += event.delta;
      if (type === "response.output_text.done" && typeof event.text === "string") text = event.text;
      if (type === "response.output_item.done" && typeof event.item === "object" && event.item !== null) completedItems.push(event.item as Record<string, unknown>);
      if (type === "response.completed" && typeof event.response === "object" && event.response !== null) {
        const response = event.response as Record<string, unknown>;
        if (typeof response.model === "string") model = response.model;
        if (response.usage !== undefined) usage = response.usage;
        if (Array.isArray(response.output) && response.output.length > 0) completedOutput = response.output as Array<Record<string, unknown>>;
      }
    } catch {
      // Non-JSON frames cannot establish model identity or response content.
    }
  }
  return { ...(model ? { model } : {}), ...(usage !== undefined ? { usage } : {}), output: completedOutput ?? (completedItems.length > 0 ? completedItems : text ? [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }] : []) };
}

function makeAdapter(options: OpenCodexProxyOptions, entry: ProxyModelEntry): ProviderAdapter {
  const base = options.baseUrl.replace(/\/$/, "");
  const desc: ProviderDescriptor = { id: entry.providerId, models: [entry.modelId], auth: "proxy", health: "healthy", tier: entry.tier, capabilities: (entry.capabilities ?? ["responses"]) as any };

  async function streamInvoke(req: ProviderInvocationRequest): Promise<Response | null> {
    if (req.signal.aborted) return null;
    const raw = req.body ?? {};
    if (typeof raw !== "object" || raw === null) return null;
    const rec = raw as Record<string, unknown>;
    if (Object.keys(rec).some((key) => key.toLowerCase().startsWith("costguard"))) return null;
    const b = bodyFor(entry.providerId, req.protocol, rec);
    try { return await fetchTrustedProxy(base + pathFor(req.protocol, options), b, req.signal, options.timeoutMs); }
    catch { return null; }
  }

  async function invoke(req: ProviderInvocationRequest): Promise<ProviderInvocationResult> {
    if (req.signal.aborted) return { status: "cancelled", actualRuntimeModel: "UNKNOWN" };
    const raw = req.body ?? {};
    if (typeof raw !== "object" || raw === null) return { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "proxy-body-invalid" };
    const rec = raw as Record<string, unknown>;
    if (Object.keys(rec).some((key) => key.toLowerCase().startsWith("costguard"))) return { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "proxy-purebody-required" };
    const b = bodyFor(entry.providerId, req.protocol, rec);
    try {
      const resp = await fetchTrustedProxy(base + pathFor(req.protocol, options), b, req.signal, options.timeoutMs);
      if (!resp.ok) return { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: redactedHttpFailure(resp.status) };
      const isStream = entry.providerId === "openai" && req.protocol === "responses";
      let model: string | undefined;
      let data: unknown;
      if (isStream) {
        const text = await resp.text();
        const parsed = parseOpenAiResponsesSse(text);
        model = parsed.model;
        data = { model, usage: parsed.usage, output: parsed.output };
        if (!model) return { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "proxy-sse-parse-failed" };
      } else {
        const json = await resp.json() as Record<string, unknown>;
        model = typeof json.model === "string" ? json.model : undefined;
        data = json;
      }
      const reqModel = req.requestedModel.includes("/") ? req.requestedModel.split("/")[1] : req.requestedModel;
      if (model !== reqModel) return { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "proxy-model-identity-mismatch" };
      return { status: "PRESENT", actualRuntimeModel: entry.providerId + "/" + model, response: data };
    } catch (e: any) {
      if (req.signal.aborted || e?.name === "AbortError") return { status: "cancelled", actualRuntimeModel: "UNKNOWN" };
      if (e instanceof ProxyTimeoutError) return { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "proxy-request-timeout" };
      return { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "proxy-request-failed" };
    }
  }

  return { descriptor: desc, invoke, streamInvoke };
}

export function createOpenCodexProxyAdapters(options: OpenCodexProxyOptions): ProviderAdapter[] {
  validateOptions(options);
  const byProvider = new Map<string, ProxyModelEntry[]>();
  for (const e of FROZEN_MODELS) { const l = byProvider.get(e.providerId) ?? []; l.push(e); byProvider.set(e.providerId, l); }
  return [...byProvider.entries()].map(([pid, entries]) => {
    const a = makeAdapter(options, entries[0]);
    a.descriptor.models = entries.map((entry) => entry.modelId);
    a.descriptor.modelTiers = Object.fromEntries(entries.map((entry) => [entry.modelId, entry.tier]));
    if (new Set(entries.map((entry) => entry.tier)).size > 1) delete a.descriptor.tier;
    return a;
  });
}

export function createOpenCodexProxyAdapter(options: OpenCodexProxyOptions): ProviderAdapter {
  validateOptions(options);
  return makeAdapter(options, FROZEN_MODELS[3]);
}
