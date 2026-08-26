import { readFile } from "node:fs/promises";
import { atomicWriteOwnedJson, isOwnedJson } from "../config/homes";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const MAX_MODELS = 2_000;
const MAX_MODEL_ID = 128;

export type ProxyDiscoveryResult =
  | { status: "PRESENT"; source: "proxy-model-discovery"; models: string[] }
  | { status: "UNKNOWN"; failClosed: true; reason: "model-discovery-loopback-required" | "model-discovery-request-failed" | "model-discovery-invalid" | "model-discovery-ambiguous" };

export type ProxyDiscoveryCache = {
  version: 1;
  source: "proxy-model-discovery-cache";
  models: string[];
  observedAt: string;
};

export type ProxyDiscoveryCacheResult =
  | { status: "PRESENT"; source: "proxy-model-discovery-cache"; models: string[]; observedAt: string }
  | { status: "MISSING"; reason: "model-discovery-cache-not-found" }
  | { status: "UNKNOWN"; failClosed: true; reason: "model-discovery-cache-unverified" };

function validModelId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_MODEL_ID && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

export function parseBoundedModelDiscovery(value: unknown): string[] | undefined {
  const items = Array.isArray(value) ? value : typeof value === "object" && value !== null && Array.isArray((value as { data?: unknown }).data) ? (value as { data: unknown[] }).data : undefined;
  if (!items || items.length > MAX_MODELS) return undefined;
  const ids = items.map((item) => typeof item === "string" ? item : typeof item === "object" && item !== null ? (item as { id?: unknown }).id : undefined);
  if (ids.some((id) => !validModelId(id))) return undefined;
  return [...new Set(ids as string[])];
}

/** Read a bounded, fixed-path model list from an explicitly configured loopback proxy. This does not prove provider health. */
export async function discoverTrustedProxyModels(input: { baseUrl: string; configuredRoutes: readonly string[] }): Promise<ProxyDiscoveryResult> {
  let base: URL;
  try { base = new URL(input.baseUrl); } catch { return { status: "UNKNOWN", failClosed: true, reason: "model-discovery-loopback-required" }; }
  if (base.protocol !== "http:" || !LOOPBACK_HOSTS.has(base.hostname) || base.pathname !== "/" && base.pathname !== "" || base.search || base.hash || base.username || base.password) {
    return { status: "UNKNOWN", failClosed: true, reason: "model-discovery-loopback-required" };
  }
  try {
    const response = await fetch(`${base.toString().replace(/\/$/, "")}/v1/models`, { method: "GET", headers: { accept: "application/json" }, signal: AbortSignal.timeout(3_000) });
    if (!response.ok) return { status: "UNKNOWN", failClosed: true, reason: "model-discovery-request-failed" };
    const models = parseBoundedModelDiscovery(await response.json());
    if (!models) return { status: "UNKNOWN", failClosed: true, reason: "model-discovery-invalid" };
    const visible: string[] = [];
    for (const model of models) {
      const routes = input.configuredRoutes.filter((route) => route.endsWith(`/${model}`));
      if (routes.length > 1) return { status: "UNKNOWN", failClosed: true, reason: "model-discovery-ambiguous" };
      if (routes.length === 1) visible.push(routes[0]);
    }
    return { status: "PRESENT", source: "proxy-model-discovery", models: visible };
  } catch {
    return { status: "UNKNOWN", failClosed: true, reason: "model-discovery-request-failed" };
  }
}

function validCache(value: unknown): value is ProxyDiscoveryCache {
  if (typeof value !== "object" || value === null) return false;
  const cache = value as Partial<ProxyDiscoveryCache>;
  return cache.version === 1 && cache.source === "proxy-model-discovery-cache" && typeof cache.observedAt === "string"
    && Array.isArray(cache.models) && cache.models.every((route) => typeof route === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(route)) && new Set(cache.models).size === cache.models.length;
}

/** Read an owned cache only as metadata. It never makes a Provider ready or available. */
export async function readProxyDiscoveryCache(path: string): Promise<ProxyDiscoveryCacheResult> {
  const raw = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? undefined : Promise.reject(error));
  if (raw === undefined) return { status: "MISSING", reason: "model-discovery-cache-not-found" };
  if (!(await isOwnedJson(path))) return { status: "UNKNOWN", failClosed: true, reason: "model-discovery-cache-unverified" };
  try {
    const cache = JSON.parse(raw) as unknown;
    if (!validCache(cache)) return { status: "UNKNOWN", failClosed: true, reason: "model-discovery-cache-unverified" };
    return { status: "PRESENT", source: cache.source, models: [...cache.models], observedAt: cache.observedAt };
  } catch {
    return { status: "UNKNOWN", failClosed: true, reason: "model-discovery-cache-unverified" };
  }
}

/** Preflight ownership before contacting a proxy, then persist only allowlisted route IDs and a timestamp. */
export async function persistProxyDiscoveryCache(path: string, result: Extract<ProxyDiscoveryResult, { status: "PRESENT" }>, observedAt: string): Promise<ProxyDiscoveryCacheResult> {
  const existing = await readProxyDiscoveryCache(path);
  if (existing.status === "UNKNOWN") return existing;
  const cache: ProxyDiscoveryCache = { version: 1, source: "proxy-model-discovery-cache", models: [...result.models], observedAt };
  try {
    await atomicWriteOwnedJson(path, cache);
    return { status: "PRESENT", source: cache.source, models: [...cache.models], observedAt };
  } catch {
    return { status: "UNKNOWN", failClosed: true, reason: "model-discovery-cache-unverified" };
  }
}
