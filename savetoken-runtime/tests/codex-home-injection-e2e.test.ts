import { expect, test } from "bun:test";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRuntime } from "../src/server/runtime";

const TOKEN = "isolated-management-token";

async function api(baseUrl: string, path: string, method: "GET" | "POST") {
  const response = await fetch(baseUrl + path, { method, headers: { authorization: `Bearer ${TOKEN}` } });
  return { status: response.status, body: await response.json() };
}

test("isolated CODEX_HOME install projects the runtime catalog, preserves user config, and uninstall removes only its owned projection", async () => {
  const root = await mkdtemp(join(tmpdir(), "savetoken-codex-injection-"));
  const codexHome = join(root, "codex-home");
  const saveTokenHome = join(root, "savetoken-home");
  await (await import("node:fs/promises")).mkdir(codexHome, { recursive: true });
  await writeFile(join(codexHome, "config.toml"), 'model = "user-choice"\nuser_flag = true\n', "utf8");
  const runtime = await startRuntime({
    env: { CODEX_HOME: codexHome, SAVETOKEN_HOME: saveTokenHome },
    providers: { deepseek: ["deepseek-v4-flash"], openai: ["gpt-5.6-luna"] },
    combos: [{ id: "execution-fast", aliases: ["fast-execution"], tier: "execution", strategy: "round-robin", targets: [{ route: "deepseek/deepseek-v4-flash" }, { route: "openai/gpt-5.6-luna" }] }],
    managementToken: TOKEN,
    providerAdapters: [{ descriptor: { id: "deepseek", models: ["deepseek-v4-flash"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] }, invoke: async () => ({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN" }) }],
    providerTier: "execution",
    taskSignals: () => ({ text: "extract fixture records", isBatchOrRepetitive: true }),
  });
  const projection = join(codexHome, "opencodex-catalog.json");
  try {
    const install = await api(runtime.baseUrl, "/api/install", "POST");
    expect(install.status).toBe(200);
    const catalog = JSON.parse(await readFile(projection, "utf8"));
    expect(catalog.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "deepseek/deepseek-v4-flash" }),
      expect.objectContaining({ id: "openai/gpt-5.6-luna" }),
    ]));
    expect(catalog.combos).toEqual([{
      id: "execution-fast",
      aliases: ["fast-execution"],
      tier: "execution",
      strategy: "round-robin",
      routes: ["deepseek/deepseek-v4-flash", "openai/gpt-5.6-luna"],
    }]);
    const installedConfig = await readFile(join(codexHome, "config.toml"), "utf8");
    expect(installedConfig).toContain('model = "user-choice"\nuser_flag = true\n');
    expect(installedConfig).toContain("# >>> savetoken managed proxy >>>");
    expect(installedConfig).toContain(`openai_base_url = "${runtime.baseUrl}/v1"`);

    const sync = await api(runtime.baseUrl, "/api/sync", "POST");
    expect(sync.status).toBe(200);
    const uninstall = await api(runtime.baseUrl, "/api/uninstall", "POST");
    expect(uninstall.status).toBe(200);
    await expect(access(projection)).rejects.toBeTruthy();
    expect(await readFile(join(codexHome, "config.toml"), "utf8")).toBe('model = "user-choice"\nuser_flag = true\n');
  } finally {
    runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("isolated CODEX_HOME install fails closed rather than overwriting an unowned catalog projection", async () => {
  const root = await mkdtemp(join(tmpdir(), "savetoken-codex-unowned-"));
  const codexHome = join(root, "codex-home");
  const saveTokenHome = join(root, "savetoken-home");
  await (await import("node:fs/promises")).mkdir(codexHome, { recursive: true });
  const projection = join(codexHome, "opencodex-catalog.json");
  await writeFile(projection, '{"user":"catalog"}\n', "utf8");
  const runtime = await startRuntime({
    env: { CODEX_HOME: codexHome, SAVETOKEN_HOME: saveTokenHome }, providers: { deepseek: ["deepseek-v4-flash"] }, managementToken: TOKEN,
    providerAdapters: [{ descriptor: { id: "deepseek", models: ["deepseek-v4-flash"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] }, invoke: async () => ({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN" }) }], providerTier: "execution",
    taskSignals: () => ({ text: "extract fixture records", isBatchOrRepetitive: true }),
  });
  try {
    const install = await api(runtime.baseUrl, "/api/install", "POST");
    expect(install.status).toBe(503);
    expect(install.body).toMatchObject({ status: "UNKNOWN" });
    expect(await readFile(projection, "utf8")).toBe('{"user":"catalog"}\n');
  } finally {
    runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("isolated CODEX_HOME restore removes an unchanged owned projection and refuses a later user edit", async () => {
  const root = await mkdtemp(join(tmpdir(), "savetoken-codex-restore-"));
  const codexHome = join(root, "codex-home");
  const saveTokenHome = join(root, "savetoken-home");
  const projection = join(codexHome, "opencodex-catalog.json");
  const runtime = await startRuntime({
    env: { CODEX_HOME: codexHome, SAVETOKEN_HOME: saveTokenHome }, providers: { deepseek: ["deepseek-v4-flash"] }, managementToken: TOKEN,
    providerAdapters: [{ descriptor: { id: "deepseek", models: ["deepseek-v4-flash"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] }, invoke: async () => ({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN" }) }], providerTier: "execution",
    taskSignals: () => ({ text: "extract fixture records", isBatchOrRepetitive: true }),
  });
  try {
    expect((await api(runtime.baseUrl, "/api/install", "POST")).status).toBe(200);
    expect((await api(runtime.baseUrl, "/api/restore", "POST")).status).toBe(200);
    await expect(access(projection)).rejects.toBeTruthy();

    expect((await api(runtime.baseUrl, "/api/install", "POST")).status).toBe(200);
    await writeFile(projection, '{"user":"edited-after-install"}\n', "utf8");
    const refused = await api(runtime.baseUrl, "/api/restore", "POST");
    expect(refused.status).toBe(503);
    expect(refused.body).toMatchObject({ status: "UNKNOWN", reason: "owned-state-unverified" });
    expect(await readFile(projection, "utf8")).toBe('{"user":"edited-after-install"}\n');
  } finally {
    runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("real install projects only explicit catalog selection, subagent, and effort configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "savetoken-codex-catalog-options-"));
  const codexHome = join(root, "codex-home");
  const saveTokenHome = join(root, "savetoken-home");
  const runtime = await startRuntime({
    env: { CODEX_HOME: codexHome, SAVETOKEN_HOME: saveTokenHome },
    providers: { deepseek: ["deepseek-v4-flash"], openai: ["gpt-5.6-luna"] }, managementToken: TOKEN,
    catalog: {
      selectedModels: ["deepseek/deepseek-v4-flash"],
      subagentModels: ["openai/gpt-5.6-luna"],
      injectionModel: "openai/gpt-5.6-luna",
      injectionEffort: "low",
    },
  });
  try {
    expect((await api(runtime.baseUrl, "/api/install", "POST")).status).toBe(200);
    const catalog = JSON.parse(await readFile(join(codexHome, "opencodex-catalog.json"), "utf8"));
    expect(catalog.models).toEqual([
      { id: "deepseek/deepseek-v4-flash", provider: "deepseek", selected: true, subagent: false, injection: false },
      { id: "openai/gpt-5.6-luna", provider: "openai", selected: false, subagent: true, injection: true, injectionEffort: "low" },
    ]);
  } finally { runtime.stop(); await rm(root, { recursive: true, force: true }); }
});

test("real install fails closed before catalog write for an invalid explicit effort", async () => {
  const root = await mkdtemp(join(tmpdir(), "savetoken-codex-catalog-invalid-"));
  const codexHome = join(root, "codex-home");
  const runtime = await startRuntime({
    env: { CODEX_HOME: codexHome, SAVETOKEN_HOME: join(root, "savetoken-home") },
    providers: { deepseek: ["deepseek-v4-flash"] }, managementToken: TOKEN,
    catalog: { injectionModel: "deepseek/deepseek-v4-flash", injectionEffort: "invalid" as never },
  });
  try {
    const result = await api(runtime.baseUrl, "/api/install", "POST");
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ status: "UNKNOWN", reason: "catalog-projection-format-invalid" });
    await expect(access(join(codexHome, "opencodex-catalog.json"))).rejects.toThrow();
  } finally { runtime.stop(); await rm(root, { recursive: true, force: true }); }
});

test("real install rejects a non-execution combo before writing the isolated catalog", async () => {
  const root = await mkdtemp(join(tmpdir(), "savetoken-codex-catalog-tier-"));
  const codexHome = join(root, "codex-home");
  const runtime = await startRuntime({
    env: { CODEX_HOME: codexHome, SAVETOKEN_HOME: join(root, "savetoken-home") },
    providers: { openai: ["gpt-5.6-sol"] }, managementToken: TOKEN,
    combos: [{ id: "unsafe-sol", tier: "sol" as never, strategy: "failover", targets: [{ route: "openai/gpt-5.6-sol" }] }],
  });
  try {
    const result = await api(runtime.baseUrl, "/api/install", "POST");
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ status: "UNKNOWN", reason: "catalog-projection-combo-unverified" });
    await expect(access(join(codexHome, "opencodex-catalog.json"))).rejects.toThrow();
  } finally { runtime.stop(); await rm(root, { recursive: true, force: true }); }
});
