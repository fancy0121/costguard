export type CliCommand = "status" | "ready" | "models" | "providers" | "usage" | "logs" | "restore" | "uninstall" | "install" | "sync" | "doctor" | "start" | "stop" | "demo";

export type ParsedCli =
  | { command: CliCommand; json: boolean }
  | { status: "UNKNOWN"; reason: "cli-command-unrecognized" };

export function parseCliArgs(args: string[]): ParsedCli {
  const command = args.find((arg) => !arg.startsWith("--"));
  const json = args.includes("--json");
  const known = new Set(["status", "ready", "models", "providers", "usage", "logs", "restore", "uninstall", "install", "sync", "doctor", "start", "stop", "demo"]);
  if (command && known.has(command)) {
    return { command: command as CliCommand, json };
  }
  return { status: "UNKNOWN", reason: "cli-command-unrecognized" };
}

export type CliResponse = { status: number; body: unknown };
export type CliRequest = (path: string, method: "GET" | "POST") => Promise<CliResponse>;

export async function runCli(args: string[], request: CliRequest): Promise<unknown> {
  const parsed = parseCliArgs(args);
  if ("status" in parsed) return parsed;
  if (parsed.command === "start" || parsed.command === "stop" || parsed.command === "demo") return { status: "UNKNOWN", failClosed: true, reason: "cli-process-command-requires-local-entrypoint" };
  const route: Record<CliCommand, { path: string; method: "GET" | "POST" }> = {
    status: { path: "/api/status", method: "GET" },
    ready: { path: "/api/ready", method: "GET" },
    models: { path: "/api/catalog", method: "GET" },
    providers: { path: "/api/providers", method: "GET" },
    usage: { path: "/api/usage", method: "GET" },
    logs: { path: "/api/logs", method: "GET" },
    restore: { path: "/api/restore", method: "POST" },
    uninstall: { path: "/api/uninstall", method: "POST" },
    install: { path: "/api/install", method: "POST" },
    sync: { path: "/api/sync", method: "POST" },
    doctor: { path: "/api/doctor", method: "GET" },
    start: { path: "/api/status", method: "GET" },
    stop: { path: "/api/status", method: "GET" },
    demo: { path: "/api/status", method: "GET" },
  };
  let result: CliResponse;
  try {
    result = await request(route[parsed.command].path, route[parsed.command].method);
  } catch {
    return { status: "UNKNOWN", failClosed: true, reason: "management-request-failed" };
  }
  if (result.status >= 400) return { status: "UNKNOWN", failClosed: true, httpStatus: result.status, body: result.body };
  return result.body;
}

export function renderCliResult(args: string[], value: unknown): string {
  if (args.includes("--json")) return JSON.stringify(value);
  if (typeof value === "object" && value !== null && "status" in value) {
    const v = value as Record<string, unknown>;
    const lines = [`status: ${String(v.status)}`];
    if (typeof v.notice === "string") lines.push(`notice: ${v.notice}`);
    if (typeof v.reason === "string") lines.push(`reason: ${v.reason}`);
    if (Array.isArray(v.cases)) lines.push(`cases: ${JSON.stringify(v.cases)}`);
    return lines.join("\n");
  }
  return JSON.stringify(value);
}

export function cliExitCode(value: unknown): 0 | 1 {
  if (typeof value === "object" && value !== null && "status" in value && (value as { status?: unknown }).status === "UNKNOWN") return 1;
  return 0;
}
