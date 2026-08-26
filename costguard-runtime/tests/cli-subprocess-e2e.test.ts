import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRuntime } from "../src/server/runtime";
import { atomicWriteOwnedJson } from "../src/config/homes";
import { installOpenCodexSidecar } from "../src/sidecar/opencodex-managed";

const TOKEN = "subprocess-management-token";

async function runCli(args: string[], env: Record<string, string>): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn({ cmd: [process.execPath, "src/cli/main.ts", ...args], cwd: import.meta.dir + "/..", env, stdout: "pipe", stderr: "pipe" });
  return { exitCode: await proc.exited, stdout: await new Response(proc.stdout).text(), stderr: await new Response(proc.stderr).text() };
}

async function installFixtureSidecar(home: string): Promise<void> {
  const result = await installOpenCodexSidecar({ home, installer: async (destination) => {
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, "ocx.mjs"), `
if (process.argv[2] === "restore") process.exit(0);
if (process.argv[2] !== "start") process.exit(2);
const port = Number(process.argv[process.argv.indexOf("--port") + 1]);
const server = Bun.serve({ hostname: "127.0.0.1", port, fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === "/healthz") return Response.json({ status: "healthy" });
  if (path === "/readyz") return Response.json({ status: "ready" });
  return new Response("not found", { status: 404 });
} });
const stop = () => { server.stop(true); process.exit(0); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
await new Promise(() => {});
`, "utf8");
    return { entrypoint: "ocx.mjs", version: "2.11.0" };
  }});
  expect(result.status).toBe("PRESENT");
}

test("CLI subprocess invokes the management endpoint with JSON output and a loopback-only URL", async () => {
  const root = await mkdtemp(join(tmpdir(), "costguard-cli-subprocess-"));
  const runtime = await startRuntime({
    env: { CODEX_HOME: join(root, "codex"), COSTGUARD_HOME: join(root, "state") }, providers: { fixture: ["model"] }, managementToken: TOKEN,
    providerAdapters: [{ descriptor: { id: "fixture", models: ["model"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] }, invoke: async () => ({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN" }) }], providerTier: "execution",
    taskSignals: () => ({ text: "extract fixture records", isBatchOrRepetitive: true }),
  });
  try {
    const env = { ...process.env, COSTGUARD_BASE_URL: runtime.baseUrl, COSTGUARD_MANAGEMENT_TOKEN: TOKEN } as Record<string, string>;
    const status = await runCli(["status", "--json"], env);
    expect(status.exitCode).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({ health: { status: "healthy" }, ready: { status: "ready" } });

    const providers = await runCli(["providers", "--json"], env);
    expect(providers.exitCode).toBe(0);
    expect(JSON.parse(providers.stdout)).toMatchObject({ data: [{ route: "fixture/model", availability: "available" }] });
    const usage = await runCli(["usage", "--json"], env);
    expect(usage.exitCode).toBe(0);
    expect(JSON.parse(usage.stdout)).toMatchObject({ requests: 0 });
    const logs = await runCli(["logs", "--json"], env);
    expect(logs.exitCode).toBe(0);
    expect(JSON.parse(logs.stdout)).toEqual([]);

    const external = await runCli(["status", "--json"], { ...env, COSTGUARD_BASE_URL: "https://example.invalid" });
    expect(external.exitCode).toBe(1);
    expect(external.stdout).toContain("management-base-url-loopback-required");
    expect(external.stdout).not.toContain(TOKEN);
    expect(external.stdout).not.toContain(root);

    const unauthorized = await runCli(["status", "--json"], { ...env, COSTGUARD_MANAGEMENT_TOKEN: "" });
    expect(unauthorized.exitCode).toBe(1);
    expect(JSON.parse(unauthorized.stdout)).toEqual({
      status: "UNKNOWN",
      failClosed: true,
      httpStatus: 401,
      body: { status: "UNKNOWN", failClosed: true, reason: "management-auth-required" },
    });
    expect(unauthorized.stderr).toBe("");
    expect(unauthorized.stdout).not.toContain(TOKEN);
    expect(unauthorized.stdout).not.toContain(root);
  } finally {
    runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI subprocess start and stop manage only an isolated local runtime state", async () => {
  const root = await mkdtemp(join(tmpdir(), "costguard-cli-process-"));
  try {
    await installFixtureSidecar(root);
    const env = { ...process.env, COSTGUARD_HOME: root, COSTGUARD_PORT: "18986", COSTGUARD_OPENCODEX_PORT: "19086", COSTGUARD_PROVIDERS_JSON: "{}" } as Record<string, string>;
    const start = await runCli(["start", "--json"], env);
    expect(start.exitCode).toBe(0);
    expect(JSON.parse(start.stdout)).toMatchObject({ status: "PRESENT", sidecar: { status: "PRESENT", port: 19086 }, runtime: { status: "PRESENT", port: 18986 } });
    expect((await fetch("http://127.0.0.1:18986/healthz")).status).toBe(503);
    const stop = await runCli(["stop", "--json"], env);
    expect(stop.exitCode).toBe(0);
    expect(JSON.parse(stop.stdout)).toMatchObject({ status: "PRESENT", runtime: { status: "PRESENT", port: 18986 }, sidecar: { status: "PRESENT", port: 19086 } });
    await expect(fetch("http://127.0.0.1:18986/readyz", { signal: AbortSignal.timeout(250) })).rejects.toThrow();
    const uninstall = await runCli(["uninstall", "--json"], env);
    expect(uninstall.exitCode).toBe(0);
    expect(JSON.parse(uninstall.stdout)).toMatchObject({ status: "PRESENT", restored: { status: "PRESENT" }, uninstalled: { status: "PRESENT" } });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("CLI subprocess keeps invalid startup configuration fail-closed with its stable error class", async () => {
  const root = await mkdtemp(join(tmpdir(), "costguard-cli-invalid-config-"));
  try {
    const result = await runCli(["start", "--json"], {
      ...process.env, COSTGUARD_HOME: root, COSTGUARD_PORT: "18987", COSTGUARD_PROVIDERS_JSON: "{invalid",
    } as Record<string, string>);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ status: "UNKNOWN", failClosed: true, reason: "provider-config-invalid" });
    expect(result.stdout).not.toContain(root);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("CLI subprocess doctor detects an owned stale process state", async () => {
  const root = await mkdtemp(join(tmpdir(), "costguard-cli-doctor-stale-"));
  const costGuardHome = join(root, "state");
  await atomicWriteOwnedJson(join(costGuardHome, "process.json"), { pid: 999_999, port: 18_988 });
  const runtime = await startRuntime({
    env: { CODEX_HOME: join(root, "codex"), COSTGUARD_HOME: costGuardHome },
    providers: {},
    managementToken: TOKEN,
  });
  try {
    const result = await runCli(["doctor", "--json"], {
      ...process.env,
      COSTGUARD_BASE_URL: runtime.baseUrl,
      COSTGUARD_MANAGEMENT_TOKEN: TOKEN,
    } as Record<string, string>);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "UNKNOWN",
      failClosed: true,
      httpStatus: 503,
      body: {
        status: "UNKNOWN",
        stalePid: true,
        findings: ["runtime-process-state-stale", "runtime-state-present"],
      },
    });
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain(root);
  } finally {
    runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("a second CLI runtime on the same fixed port fails instead of adopting the first runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "costguard-cli-port-conflict-"));
  const firstHome = join(root, "first");
  const secondHome = join(root, "second");
  const port = "18989";
  const sidecarPort = "19089";
  await installFixtureSidecar(firstHome);
  await installFixtureSidecar(secondHome);
  const firstEnv = { ...process.env, COSTGUARD_HOME: firstHome, COSTGUARD_PORT: port, COSTGUARD_OPENCODEX_PORT: sidecarPort, COSTGUARD_PROVIDERS_JSON: "{}" } as Record<string, string>;
  const secondEnv = { ...process.env, COSTGUARD_HOME: secondHome, COSTGUARD_PORT: port, COSTGUARD_OPENCODEX_PORT: sidecarPort, COSTGUARD_PROVIDERS_JSON: "{}" } as Record<string, string>;
  try {
    const first = await runCli(["start", "--json"], firstEnv);
    expect(first.exitCode).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({ status: "PRESENT", sidecar: { port: 19_089 }, runtime: { port: 18_989 } });

    const second = await runCli(["start", "--json"], secondEnv);
    expect(second.exitCode).toBe(1);
    expect(JSON.parse(second.stdout)).toEqual({ status: "UNKNOWN", failClosed: true, reason: "sidecar-port-in-use" });
    expect(second.stderr).toBe("");
    expect(second.stdout).not.toContain(root);
  } finally {
    await runCli(["stop", "--json"], firstEnv);
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI subprocess runs the isolated install, status, sync, doctor, restore, and uninstall lifecycle", async () => {
  const root = await mkdtemp(join(tmpdir(), "costguard-cli-full-lifecycle-"));
  const runtime = await startRuntime({
    env: { CODEX_HOME: join(root, "codex"), COSTGUARD_HOME: join(root, "state") },
    providers: { fixture: ["model"] },
    managementToken: TOKEN,
  });
  const env = {
    ...process.env,
    COSTGUARD_BASE_URL: runtime.baseUrl,
    COSTGUARD_MANAGEMENT_TOKEN: TOKEN,
  } as Record<string, string>;
  try {
    for (const command of ["install", "status", "sync", "doctor", "restore"] as const) {
      const result = await runCli([command, "--json"], env);
      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      expect(result.stderr).toBe("");
    }

    const reinstall = await runCli(["install", "--json"], env);
    expect(reinstall.exitCode).toBe(0);
    expect(JSON.parse(reinstall.stdout)).toMatchObject({ status: "PRESENT" });
    const uninstall = await runCli(["uninstall", "--json"], env);
    expect(uninstall.exitCode).toBe(0);
    expect(JSON.parse(uninstall.stdout)).toMatchObject({ status: "PRESENT" });
    const repeated = await runCli(["uninstall", "--json"], env);
    expect(repeated.exitCode).toBe(1);
    expect(JSON.parse(repeated.stdout)).toMatchObject({ status: "UNKNOWN", httpStatus: 404, body: { status: "MISSING" } });
    expect(repeated.stdout).not.toContain(root);
  } finally {
    runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});
