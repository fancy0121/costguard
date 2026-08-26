import { cliExitCode, renderCliResult, runCli } from "./commands";
import { parseCliArgs } from "./commands";
import { startRuntimeProcess, stopRuntimeProcess } from "./process";
import { resolveHomes } from "../config/homes";
import { inspectRuntimeProcessState } from "./process";
import { legacyEnvironmentFailure, runLocalLifecycleCommand } from "./local-lifecycle";
import { healthOpenCodexSidecar, installOpenCodexSidecar, inspectOpenCodexSidecar, restoreOpenCodexSidecar, startOpenCodexSidecar, stopOpenCodexSidecar, uninstallOpenCodexSidecar } from "../sidecar/opencodex-managed";
import { runCostGuardDemo } from "../demo";

export function resolveCliBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.COSTGUARD_BASE_URL?.trim();
  if (explicit) {
    try {
      const parsed = new URL(explicit);
      const loopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "[::1]";
      if (parsed.protocol !== "http:" || !loopback || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error("management-base-url-loopback-required");
      return parsed.origin;
    } catch (error) {
      if (error instanceof Error && error.message === "management-base-url-loopback-required") throw error;
      throw new Error("management-base-url-loopback-required");
    }
  }
  const parsedPort = Number.parseInt(env.COSTGUARD_PORT ?? "8787", 10);
  const port = Number.isInteger(parsedPort) && parsedPort >= 0 && parsedPort <= 65535 ? parsedPort : 8787;
  return `http://127.0.0.1:${port}`;
}

function cliFailure(error: unknown): { status: "UNKNOWN"; failClosed: true; reason: string } {
  const safe = new Set(["management-base-url-loopback-required", "provider-config-invalid", "runtime-port-invalid"]);
  const reason = error instanceof Error && safe.has(error.message) ? error.message : "cli-operation-failed";
  return { status: "UNKNOWN", failClosed: true, reason };
}

function portFromEnvironment(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new Error("runtime-port-invalid");
  return parsed;
}

function providersFromEnvironment(): Record<string, string[]> {
  try { return process.env.COSTGUARD_PROVIDERS_JSON ? JSON.parse(process.env.COSTGUARD_PROVIDERS_JSON) as Record<string, string[]> : {}; }
  catch { throw new Error("provider-config-invalid"); }
}

function localLifecycleDependencies() {
  const home = resolveHomes(process.env).costGuardHome;
  const runtimePort = portFromEnvironment("COSTGUARD_PORT", 8787);
  const sidecarPort = portFromEnvironment("COSTGUARD_OPENCODEX_PORT", 10100);
  return {
    installSidecar: () => installOpenCodexSidecar({ home }),
    startSidecar: () => startOpenCodexSidecar({ home, port: sidecarPort }),
    startRuntime: () => startRuntimeProcess({ home, port: runtimePort, providers: providersFromEnvironment(), proxyBaseUrl: `http://127.0.0.1:${sidecarPort}` }),
    inspectSidecar: async () => {
      const inspection = await inspectOpenCodexSidecar(home);
      if (inspection.status === "PRESENT" && inspection.running && inspection.port) {
        const health = await healthOpenCodexSidecar(inspection.port);
        if (health.status === "UNKNOWN") return health;
      }
      return inspection;
    },
    inspectRuntime: () => inspectRuntimeProcessState(home),
    stopRuntime: () => stopRuntimeProcess(home),
    stopSidecar: () => stopOpenCodexSidecar(home),
    restoreSidecar: () => restoreOpenCodexSidecar(home),
    uninstallSidecar: () => uninstallOpenCodexSidecar(home),
  };
}

if (import.meta.main) {
  let result: unknown;
  try {
    const args = process.argv.slice(2);
    const parsed = parseCliArgs(args);
    const legacy = legacyEnvironmentFailure(process.env);
    if (legacy) {
      result = legacy;
    } else if ("command" in parsed && parsed.command === "demo") {
      result = await runCostGuardDemo();
    } else if ("command" in parsed && ["install", "start", "stop", "restore", "uninstall"].includes(parsed.command) && !process.env.COSTGUARD_BASE_URL) {
      if (parsed.command === "start") providersFromEnvironment();
      result = await runLocalLifecycleCommand(parsed.command as "install" | "start" | "status" | "doctor" | "stop" | "restore" | "uninstall", localLifecycleDependencies());
    } else if ("command" in parsed && ["status", "doctor"].includes(parsed.command) && !process.env.COSTGUARD_BASE_URL) {
      result = await runLocalLifecycleCommand(parsed.command as "status" | "doctor", localLifecycleDependencies());
    } else {
      const baseUrl = resolveCliBaseUrl(process.env);
      const managementToken = process.env.COSTGUARD_MANAGEMENT_TOKEN;
      result = await runCli(args, async (path, method) => {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers: managementToken ? { authorization: `Bearer ${managementToken}` } : undefined,
        });
        let body: unknown;
        try { body = await response.json(); } catch { body = { status: "UNKNOWN", reason: "non-json-management-response" }; }
        return { status: response.status, body };
      });
    }
  } catch (error) {
    result = cliFailure(error);
  }
  console.log(renderCliResult(process.argv.slice(2), result));
  process.exitCode = cliExitCode(result);
}

export { runCli } from "./commands";
