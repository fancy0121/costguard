import { kill } from "node:process";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteOwnedJson, isOwnedJson } from "../config/homes";

export type RuntimeProcessResult =
  | { status: "PRESENT"; port: number }
  | { status: "MISSING"; reason: "runtime-not-started" }
  | { status: "UNKNOWN"; failClosed: true; reason: "runtime-already-started" | "runtime-state-stale" | "runtime-spawn-failed" | "runtime-state-unverified" | "runtime-readiness-timeout" | "runtime-stop-timeout" | "runtime-port-in-use" };

type ProcessState = { pid: number; port: number };
export type RuntimeProcessInspection = "missing" | "live" | "stale" | "unverified";

function statePath(home: string): string { return join(home, "process.json"); }

function live(pid: number): boolean {
  try { kill(pid, 0); return true; } catch { return false; }
}

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return true;
    await Bun.sleep(25);
  }
  return check();
}

/** Confirm only that the spawned loopback server is bound; Provider readiness remains separate. */
async function serverBound(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(150) });
    return true;
  } catch { return false; }
}

async function state(home: string): Promise<ProcessState | undefined> {
  try {
    const raw = await readFile(statePath(home), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return typeof parsed.pid === "number" && Number.isInteger(parsed.pid) && parsed.pid > 0 && typeof parsed.port === "number" && Number.isInteger(parsed.port) ? { pid: parsed.pid, port: parsed.port } : undefined;
  } catch { return undefined; }
}

export async function inspectRuntimeProcessState(home: string): Promise<RuntimeProcessInspection> {
  const path = statePath(home);
  let present = false;
  try { await readFile(path, "utf8"); present = true; } catch { return "missing"; }
  if (!present || !(await isOwnedJson(path))) return "unverified";
  const current = await state(home);
  if (!current) return "unverified";
  return live(current.pid) ? "live" : "stale";
}

export async function startRuntimeProcess(options: { home: string; port: number; providers: Record<string, string[]>; proxyBaseUrl?: string; readyTimeoutMs?: number }): Promise<RuntimeProcessResult> {
  const existing = await state(options.home);
  if (existing) return live(existing.pid) ? { status: "UNKNOWN", failClosed: true, reason: "runtime-already-started" } : { status: "UNKNOWN", failClosed: true, reason: "runtime-state-stale" };
  if (await serverBound(options.port)) return { status: "UNKNOWN", failClosed: true, reason: "runtime-port-in-use" };
  const source = join(import.meta.dir, "..", "index.ts");
  try {
    const child = Bun.spawn({
      cmd: [process.execPath, source],
      env: { ...process.env, COSTGUARD_HOME: options.home, CODEX_HOME: join(options.home, "codex-home"), COSTGUARD_PORT: String(options.port), COSTGUARD_PROVIDERS_JSON: JSON.stringify(options.providers), ...(options.proxyBaseUrl ? { COSTGUARD_OPENCODEX_PROXY_URL: options.proxyBaseUrl } : {}) },
      stdout: "ignore", stderr: "ignore",
      detached: true,
    });
    if (!child.pid) return { status: "UNKNOWN", failClosed: true, reason: "runtime-spawn-failed" };
    child.unref();
    await atomicWriteOwnedJson(statePath(options.home), { pid: child.pid, port: options.port });
    if (!(await waitFor(() => serverBound(options.port), options.readyTimeoutMs ?? 2_000))) {
      try { kill(child.pid, "SIGTERM"); } catch { /* no unowned PID is used */ }
      await unlink(statePath(options.home)).catch(() => undefined);
      await unlink(`${statePath(options.home)}.owner`).catch(() => undefined);
      await unlink(`${statePath(options.home)}.owner.sha256`).catch(() => undefined);
      return { status: "UNKNOWN", failClosed: true, reason: "runtime-readiness-timeout" };
    }
    return { status: "PRESENT", port: options.port };
  } catch { return { status: "UNKNOWN", failClosed: true, reason: "runtime-spawn-failed" }; }
}

export async function stopRuntimeProcess(home: string, options: { stopTimeoutMs?: number } = {}): Promise<RuntimeProcessResult> {
  const path = statePath(home);
  const existing = await state(home);
  if (!existing) return { status: "MISSING", reason: "runtime-not-started" };
  if (!(await isOwnedJson(path))) return { status: "UNKNOWN", failClosed: true, reason: "runtime-state-unverified" };
  if (!live(existing.pid)) return { status: "UNKNOWN", failClosed: true, reason: "runtime-state-stale" };
  try { kill(existing.pid, "SIGTERM"); } catch { return { status: "UNKNOWN", failClosed: true, reason: "runtime-state-stale" }; }
  if (!(await waitFor(() => !live(existing.pid), options.stopTimeoutMs ?? 2_000))) return { status: "UNKNOWN", failClosed: true, reason: "runtime-stop-timeout" };
  await unlink(path).catch(() => undefined);
  await unlink(`${path}.owner`).catch(() => undefined);
  await unlink(`${path}.owner.sha256`).catch(() => undefined);
  return { status: "PRESENT", port: existing.port };
}
