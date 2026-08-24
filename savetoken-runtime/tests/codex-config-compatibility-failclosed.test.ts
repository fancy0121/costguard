import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRuntime } from "../src/server/runtime";
import { recoverManagedCodexConfigJournal } from "../src/config/codex-config";
import { access } from "node:fs/promises";
import { atomicWriteOwnedJson } from "../src/config/homes";

const token = "isolated-config-token";

async function management(baseUrl: string, path: string) {
  const response = await fetch(baseUrl + path, { method: "POST", headers: { authorization: `Bearer ${token}` } });
  return { status: response.status, body: await response.json() };
}

function options(codexHome: string, saveTokenHome: string) {
  return {
    env: { CODEX_HOME: codexHome, SAVETOKEN_HOME: saveTokenHome },
    providers: { deepseek: ["deepseek-v4-flash"] },
    managementToken: token,
    providerTier: "execution" as const,
    providerAdapters: [{
      descriptor: { id: "deepseek", models: ["deepseek-v4-flash"], auth: "fixture" as const, health: "healthy" as const, tier: "execution" as const, capabilities: ["responses" as const] },
      invoke: async () => ({ status: "UNKNOWN" as const, actualRuntimeModel: "UNKNOWN" as const }),
    }],
    taskSignals: () => ({ text: "extract fixture records", isBatchOrRepetitive: true }),
  };
}

test("isolated config injects a root marker, preserves user content, and restores only an unchanged managed block", async () => {
  const root = await mkdtemp(join(tmpdir(), "savetoken-config-contract-"));
  const codexHome = join(root, "codex");
  const saveTokenHome = join(root, "savetoken");
  const config = join(codexHome, "config.toml");
  await (await import("node:fs/promises")).mkdir(codexHome, { recursive: true });
  await writeFile(config, 'model = "user-choice"\n[features]\nflag = true\n', "utf8");
  const runtime = await startRuntime(options(codexHome, saveTokenHome));
  try {
    expect((await management(runtime.baseUrl, "/api/install")).status).toBe(200);
    const injected = await readFile(config, "utf8");
    expect(injected).toContain('model = "user-choice"');
    expect(injected).toContain("# >>> savetoken managed proxy >>>");
    expect(injected).toContain(`openai_base_url = "${runtime.baseUrl}/v1"`);
    expect(injected.indexOf("openai_base_url")).toBeLessThan(injected.indexOf("[features]"));

    expect((await management(runtime.baseUrl, "/api/restore")).status).toBe(200);
    expect(await readFile(config, "utf8")).toBe('model = "user-choice"\n[features]\nflag = true\n');

    expect((await management(runtime.baseUrl, "/api/install")).status).toBe(200);
    await writeFile(config, `${await readFile(config, "utf8")}user_added = "after-install"\n`, "utf8");
    const projectionBeforeSync = await readFile(join(codexHome, "opencodex-catalog.json"), "utf8");
    const syncRefused = await management(runtime.baseUrl, "/api/sync");
    expect(syncRefused.status).toBe(503);
    expect(syncRefused.body).toMatchObject({ status: "UNKNOWN", reason: "managed-config-unverified" });
    expect(await readFile(join(codexHome, "opencodex-catalog.json"), "utf8")).toBe(projectionBeforeSync);
    const refused = await management(runtime.baseUrl, "/api/restore");
    expect(refused.status).toBe(503);
    expect(refused.body).toMatchObject({ status: "UNKNOWN", reason: "managed-config-unverified" });
    expect(await readFile(config, "utf8")).toContain('user_added = "after-install"');
  } finally {
    runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("isolated config rejects a user-owned proxy root key and a malformed managed block", async () => {
  const root = await mkdtemp(join(tmpdir(), "savetoken-config-conflict-"));
  const codexHome = join(root, "codex");
  const saveTokenHome = join(root, "savetoken");
  const config = join(codexHome, "config.toml");
  await (await import("node:fs/promises")).mkdir(codexHome, { recursive: true });
  await writeFile(config, 'openai_base_url = "https://user.example/v1"\n', "utf8");
  const runtime = await startRuntime(options(codexHome, saveTokenHome));
  try {
    const conflict = await management(runtime.baseUrl, "/api/install");
    expect(conflict.status).toBe(503);
    expect(conflict.body).toMatchObject({ status: "UNKNOWN", reason: "managed-config-conflict" });
    expect(await readFile(config, "utf8")).toBe('openai_base_url = "https://user.example/v1"\n');
    await expect(access(join(codexHome, "opencodex-catalog.json"))).rejects.toThrow();
    await expect(access(join(saveTokenHome, "installed.json"))).rejects.toThrow();

    await writeFile(config, "# >>> savetoken managed proxy >>>\nopenai_base_url = \"http://127.0.0.1:1/v1\"\n", "utf8");
    const malformed = await management(runtime.baseUrl, "/api/install");
    expect(malformed.status).toBe(503);
    expect(malformed.body).toMatchObject({ status: "UNKNOWN", reason: "managed-config-format-invalid" });
  } finally {
    runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("isolated config refuses unsupported multiline TOML instead of guessing a root insertion boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "savetoken-config-multiline-"));
  const codexHome = join(root, "codex");
  const saveTokenHome = join(root, "savetoken");
  const config = join(codexHome, "config.toml");
  const original = 'notes = """\n[not-a-table]\n"""\n[features]\nflag = true\n';
  await (await import("node:fs/promises")).mkdir(codexHome, { recursive: true });
  await writeFile(config, original, "utf8");
  const runtime = await startRuntime(options(codexHome, saveTokenHome));
  try {
    const result = await management(runtime.baseUrl, "/api/install");
    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({ status: "UNKNOWN", reason: "managed-config-format-invalid" });
    expect(await readFile(config, "utf8")).toBe(original);
  } finally {
    runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("isolated managed-config journal only recovers an exact post-image and preserves divergent user bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "savetoken-config-journal-"));
  const codexHome = join(root, "codex");
  const saveTokenHome = join(root, "savetoken");
  const config = join(codexHome, "config.toml");
  const state = join(saveTokenHome, ".savetoken-codex-config.json");
  const journal = join(saveTokenHome, ".savetoken-codex-config.journal");
  await (await import("node:fs/promises")).mkdir(codexHome, { recursive: true });
  await writeFile(config, 'model = "user-choice"\n', "utf8");
  const runtime = await startRuntime(options(codexHome, saveTokenHome));
  try {
    expect((await management(runtime.baseUrl, "/api/install")).status).toBe(200);
    const stateBody = await readFile(state, "utf8");
    await atomicWriteOwnedJson(journal, JSON.parse(stateBody));
    await unlink(state);
    expect(await recoverManagedCodexConfigJournal(codexHome, saveTokenHome)).toEqual({ status: "PRESENT" });
    expect(await readFile(state, "utf8")).toBe(stateBody);

    await atomicWriteOwnedJson(journal, JSON.parse(stateBody));
    await writeFile(config, `${await readFile(config, "utf8")}user_added = true\n`, "utf8");
    expect(await recoverManagedCodexConfigJournal(codexHome, saveTokenHome)).toEqual({ status: "UNKNOWN", reason: "managed-config-unverified" });
    expect(await readFile(config, "utf8")).toContain("user_added = true");
  } finally {
    runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("isolated config preserves CRLF and state stores only hashes, not user config bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "savetoken-config-crlf-"));
  const codexHome = join(root, "codex");
  const saveTokenHome = join(root, "savetoken");
  const config = join(codexHome, "config.toml");
  const state = join(saveTokenHome, ".savetoken-codex-config.json");
  const original = 'model = "private-user-choice"\r\n[features]\r\nflag = true\r\n';
  await (await import("node:fs/promises")).mkdir(codexHome, { recursive: true });
  await writeFile(config, original, "utf8");
  const runtime = await startRuntime(options(codexHome, saveTokenHome));
  try {
    expect((await management(runtime.baseUrl, "/api/install")).status).toBe(200);
    const injected = await readFile(config, "utf8");
    expect(injected).toContain("\r\n# >>> savetoken managed proxy >>>\r\n");
    expect(injected).not.toMatch(/(?<!\r)\n/);
    const stateText = await readFile(state, "utf8");
    expect(stateText).not.toContain("private-user-choice");
    expect(JSON.parse(stateText)).toEqual(expect.objectContaining({ version: 1, preHash: expect.any(String), postHash: expect.any(String), blockHash: expect.any(String) }));
    expect((await management(runtime.baseUrl, "/api/restore")).status).toBe(200);
    expect(await readFile(config, "utf8")).toBe(original);
  } finally {
    runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("concurrent isolated lifecycle installs serialize to one managed root block", async () => {
  const root = await mkdtemp(join(tmpdir(), "savetoken-config-concurrent-"));
  const codexHome = join(root, "codex");
  const saveTokenHome = join(root, "savetoken");
  const config = join(codexHome, "config.toml");
  await (await import("node:fs/promises")).mkdir(codexHome, { recursive: true });
  await writeFile(config, 'model = "user-choice"\n', "utf8");
  const runtime = await startRuntime(options(codexHome, saveTokenHome));
  try {
    const [first, second] = await Promise.all([management(runtime.baseUrl, "/api/install"), management(runtime.baseUrl, "/api/install")]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const value = await readFile(config, "utf8");
    expect((value.match(/# >>> savetoken managed proxy >>>/g) ?? []).length).toBe(1);
    expect((value.match(/# <<< savetoken managed proxy <<</g) ?? []).length).toBe(1);
  } finally {
    runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});
