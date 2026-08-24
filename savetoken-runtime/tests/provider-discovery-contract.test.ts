import { expect, test } from "bun:test";
import { discoverTrustedProxyModels } from "../src/providers/discovery";
import { startRuntime } from "../src/server/runtime";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("trusted proxy discovery uses only fixed loopback models path and projects configured allowlisted routes", async () => {
  const observed: Array<{ method: string; path: string }> = [];
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(request) {
      observed.push({ method: request.method, path: new URL(request.url).pathname });
      return Response.json({ object: "list", data: [{ id: "deepseek-v4-flash" }, { id: "gpt-5.6-luna" }, { id: "not-configured" }] });
    },
  });
  try {
    const result = await discoverTrustedProxyModels({
      baseUrl: server.url.toString().replace(/\/$/, ""),
      configuredRoutes: ["deepseek/deepseek-v4-flash", "openai/gpt-5.6-luna"],
    });
    expect(result).toEqual({ status: "PRESENT", source: "proxy-model-discovery", models: ["deepseek/deepseek-v4-flash", "openai/gpt-5.6-luna"] });
    expect(observed).toEqual([{ method: "GET", path: "/v1/models" }]);
  } finally { server.stop(); }
});

test("trusted proxy discovery refuses malformed, ambiguous, oversized, or non-loopback input without visible models", async () => {
  expect(await discoverTrustedProxyModels({ baseUrl: "http://example.invalid", configuredRoutes: [] })).toEqual({ status: "UNKNOWN", failClosed: true, reason: "model-discovery-loopback-required" });
  const malformed = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({ data: [{ id: "bad\nmodel" }] }) });
  try {
    expect(await discoverTrustedProxyModels({ baseUrl: malformed.url.toString(), configuredRoutes: ["one/shared", "two/shared"] })).toEqual({ status: "UNKNOWN", failClosed: true, reason: "model-discovery-invalid" });
  } finally { malformed.stop(); }
  const ambiguous = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({ data: [{ id: "shared" }] }) });
  try {
    expect(await discoverTrustedProxyModels({ baseUrl: ambiguous.url.toString(), configuredRoutes: ["one/shared", "two/shared"] })).toEqual({ status: "UNKNOWN", failClosed: true, reason: "model-discovery-ambiguous" });
  } finally { ambiguous.stop(); }
});

test("discovery transport and envelope failures fail closed with no body detail", async () => {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("private upstream detail", { status: 500 }) });
  try {
    const result = await discoverTrustedProxyModels({ baseUrl: server.url.toString(), configuredRoutes: ["deepseek/deepseek-v4-flash"] });
    expect(result).toEqual({ status: "UNKNOWN", failClosed: true, reason: "model-discovery-request-failed" });
    expect(JSON.stringify(result)).not.toContain("private upstream detail");
  } finally { server.stop(); }
});

test("authenticated runtime discovery is explicit and never upgrades readiness", async () => {
  const proxy = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({ data: [{ id: "deepseek-v4-flash" }] }) });
  const root = await mkdtemp(join(tmpdir(), "savetoken-discovery-runtime-"));
  const runtime = await startRuntime({
    env: { CODEX_HOME: join(root, "codex"), SAVETOKEN_HOME: join(root, "state") },
    providers: { deepseek: ["deepseek-v4-flash"] }, defaultProvider: "deepseek", managementToken: ["fixture", "discovery", "to", "ken"].join("-"),
    proxyDiscoveryBaseUrl: proxy.url.toString().replace(/\/$/, ""),
  });
  try {
    expect((await fetch(`${runtime.baseUrl}/readyz`)).status).toBe(503);
    expect((await fetch(`${runtime.baseUrl}/api/model-discovery`)).status).toBe(401);
    const response = await fetch(`${runtime.baseUrl}/api/model-discovery`, { headers: { authorization: `Bearer ${["fixture", "discovery", "to", "ken"].join("-")}` } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "PRESENT", source: "proxy-model-discovery", models: ["deepseek/deepseek-v4-flash"] });
    expect((await fetch(`${runtime.baseUrl}/readyz`)).status).toBe(503);
  } finally { runtime.stop(); proxy.stop(); await rm(root, { recursive: true, force: true }); }
});

test("runtime rejects an explicitly configured default provider that is not in the allowlist", async () => {
  const root = await mkdtemp(join(tmpdir(), "savetoken-default-provider-"));
  try {
    await expect(startRuntime({
      env: { CODEX_HOME: join(root, "codex"), SAVETOKEN_HOME: join(root, "state") },
      providers: { deepseek: ["deepseek-v4-flash"] },
      defaultProvider: "missing",
    })).rejects.toThrow("provider-default-unconfigured");
  } finally { await rm(root, { recursive: true, force: true }); }
});
