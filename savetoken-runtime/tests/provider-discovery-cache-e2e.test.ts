import { expect, test } from "bun:test";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readProxyDiscoveryCache } from "../src/providers/discovery";
import { startRuntime } from "../src/server/runtime";

const token = ["fixture", "discovery", "token"].join("-");

test("authenticated loopback discovery persists only allowlisted route metadata and never changes readiness", async () => {
  const root = await mkdtemp(join(tmpdir(), "savetoken-discovery-cache-"));
  const proxy = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({ data: [{ id: "deepseek-v4-flash" }, { id: "not-configured" }] }) });
  const runtime = await startRuntime({
    env: { CODEX_HOME: join(root, "codex"), SAVETOKEN_HOME: join(root, "state") },
    providers: { deepseek: ["deepseek-v4-flash"] }, managementToken: token,
    proxyDiscoveryBaseUrl: proxy.url.toString().replace(/\/$/, ""),
  });
  try {
    const headers = { authorization: `Bearer ${token}` };
    expect((await fetch(`${runtime.baseUrl}/readyz`)).status).toBe(503);
    expect(await (await fetch(`${runtime.baseUrl}/api/model-discovery`, { headers })).json()).toEqual({
      status: "PRESENT", source: "proxy-model-discovery", models: ["deepseek/deepseek-v4-flash"],
    });
    const cache = await (await fetch(`${runtime.baseUrl}/api/model-discovery-cache`, { headers })).json();
    expect(cache).toMatchObject({ status: "PRESENT", source: "proxy-model-discovery-cache", models: ["deepseek/deepseek-v4-flash"], observedAt: expect.any(String) });
    expect(JSON.stringify(cache)).not.toContain("not-configured");
    expect((await fetch(`${runtime.baseUrl}/readyz`)).status).toBe(503);
  } finally { runtime.stop(); proxy.stop(); await rm(root, { recursive: true, force: true }); }
});

test("unowned discovery cache fails closed before a discovery request can overwrite it", async () => {
  const root = await mkdtemp(join(tmpdir(), "savetoken-discovery-cache-unowned-"));
  const saveTokenHome = join(root, "state");
  const cachePath = join(saveTokenHome, "provider-discovery.json");
  await (await import("node:fs/promises")).mkdir(saveTokenHome, { recursive: true });
  await writeFile(cachePath, '{"user":"cache"}\n', "utf8");
  expect(await readProxyDiscoveryCache(cachePath)).toEqual({ status: "UNKNOWN", failClosed: true, reason: "model-discovery-cache-unverified" });
  let hits = 0;
  const proxy = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => { hits += 1; return Response.json({ data: [{ id: "deepseek-v4-flash" }] }); } });
  const runtime = await startRuntime({
    env: { CODEX_HOME: join(root, "codex"), SAVETOKEN_HOME: saveTokenHome }, providers: { deepseek: ["deepseek-v4-flash"] }, managementToken: token,
    proxyDiscoveryBaseUrl: proxy.url.toString().replace(/\/$/, ""),
  });
  try {
    const response = await fetch(`${runtime.baseUrl}/api/model-discovery`, { headers: { authorization: `Bearer ${token}` } });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "UNKNOWN", failClosed: true, reason: "model-discovery-cache-unverified" });
    expect(hits).toBe(0);
    expect(await readFile(cachePath, "utf8")).toBe('{"user":"cache"}\n');
    await expect(access(`${cachePath}.owner`)).rejects.toThrow();
  } finally { runtime.stop(); proxy.stop(); await rm(root, { recursive: true, force: true }); }
});
