import { cliExitCode, renderCliResult, runCli } from "./commands";
import { parseCliArgs } from "./commands";
import { startRuntimeProcess, stopRuntimeProcess } from "./process";
import { resolveHomes } from "../config/homes";

export function resolveCliBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.SAVETOKEN_BASE_URL?.trim();
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
  const parsedPort = Number.parseInt(env.SAVETOKEN_PORT ?? "8787", 10);
  const port = Number.isInteger(parsedPort) && parsedPort >= 0 && parsedPort <= 65535 ? parsedPort : 8787;
  return `http://127.0.0.1:${port}`;
}

function cliFailure(error: unknown): { status: "UNKNOWN"; failClosed: true; reason: string } {
  const safe = new Set(["management-base-url-loopback-required", "provider-config-invalid", "runtime-port-invalid"]);
  const reason = error instanceof Error && safe.has(error.message) ? error.message : "cli-operation-failed";
  return { status: "UNKNOWN", failClosed: true, reason };
}

if (import.meta.main) {
  let result: unknown;
  try {
    const args = process.argv.slice(2);
    const parsed = parseCliArgs(args);
    if ("command" in parsed && parsed.command === "start") {
      let providers: Record<string, string[]> = {};
      try { providers = process.env.SAVETOKEN_PROVIDERS_JSON ? JSON.parse(process.env.SAVETOKEN_PROVIDERS_JSON) as Record<string, string[]> : {}; } catch { throw new Error("provider-config-invalid"); }
      const port = Number.parseInt(process.env.SAVETOKEN_PORT ?? "8787", 10);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("runtime-port-invalid");
      result = await startRuntimeProcess({ home: resolveHomes(process.env).saveTokenHome, port, providers });
    } else if ("command" in parsed && parsed.command === "stop") {
      result = await stopRuntimeProcess(resolveHomes(process.env).saveTokenHome);
    } else {
      const baseUrl = resolveCliBaseUrl(process.env);
      const managementToken = process.env.SAVETOKEN_MANAGEMENT_TOKEN;
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
