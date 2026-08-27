import { createHash } from "node:crypto";
import { kill } from "node:process";
import { createServer } from "node:net";
import { lstat, mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const PACKAGE_NAME = "@bitkyc08/opencodex";
const PACKAGE_VERSION = "2.11.0";
const OWNER = "costguard\n";

type Present = { status: "PRESENT" };
type FailureReason = "sidecar-half-installed" | "sidecar-install-failed" | "sidecar-port-in-use" | "sidecar-already-started" | "sidecar-state-stale" | "sidecar-state-unverified" | "sidecar-spawn-failed" | "sidecar-readiness-timeout" | "sidecar-stop-timeout" | "sidecar-unreachable" | "sidecar-restore-failed" | "sidecar-uninstall-blocked";
type Failure = { status: "UNKNOWN"; failClosed: true; reason: FailureReason };
type InstallManifest = { version: 1; package: string; packageVersion: string; entrypoint: string; activated: boolean };
type ProcessState = { pid: number; port: number };
export type SidecarInstaller = (destination: string) => Promise<{ entrypoint: string; version: string }>;
export type SidecarCommandRunner = (args: string[]) => Promise<number>;

function sidecarRoot(home: string): string { return join(resolve(home), "sidecar"); }
function packageRoot(home: string): string { return join(sidecarRoot(home), "package"); }
function manifestPath(home: string): string { return join(sidecarRoot(home), "install.json"); }
function processPath(home: string): string { return join(sidecarRoot(home), "process.json"); }
function hash(content: string): string { return createHash("sha256").update(content, "utf8").digest("hex"); }
async function exists(path: string): Promise<boolean> { try { await lstat(path); return true; } catch { return false; } }

async function assertNoReparsePoints(path: string, stopAt: string): Promise<void> {
  let current = resolve(path);
  const stop = resolve(stopAt);
  while (true) {
    if (await exists(current) && (await lstat(current)).isSymbolicLink()) throw new Error("sidecar-path-unverified");
    if (current === stop) return;
    const parent = dirname(current);
    if (parent === current || relative(stop, current).startsWith("..")) throw new Error("sidecar-path-unverified");
    current = parent;
  }
}

async function writeOwnedJson(path: string, value: unknown, home: string): Promise<void> {
  await assertNoReparsePoints(dirname(path), home);
  await mkdir(dirname(path), { recursive: true });
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, content, { encoding: "utf8", mode: 0o600 });
  await rename(temp, path);
  await writeFile(`${path}.owner`, OWNER, { encoding: "utf8", mode: 0o600 });
  await writeFile(`${path}.owner.sha256`, `${hash(content)}\n`, { encoding: "utf8", mode: 0o600 });
}

async function isOwnedJson(path: string): Promise<boolean> {
  try {
    const content = await readFile(path, "utf8");
    return await readFile(`${path}.owner`, "utf8") === OWNER && (await readFile(`${path}.owner.sha256`, "utf8")).trim() === hash(content);
  } catch { return false; }
}

async function removeOwnedJson(path: string): Promise<void> {
  await unlink(path).catch(() => undefined);
  await unlink(`${path}.owner`).catch(() => undefined);
  await unlink(`${path}.owner.sha256`).catch(() => undefined);
}

function safeRelativeEntrypoint(value: string): boolean { return value.length > 0 && !isAbsolute(value) && !value.split(/[\\/]/).includes(".."); }

async function readManifest(home: string): Promise<InstallManifest | undefined> {
  const path = manifestPath(home);
  if (!(await isOwnedJson(path))) return undefined;
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<InstallManifest>;
    if (value.version !== 1 || value.package !== PACKAGE_NAME || value.packageVersion !== PACKAGE_VERSION || typeof value.entrypoint !== "string" || !safeRelativeEntrypoint(value.entrypoint) || typeof value.activated !== "boolean") return undefined;
    if (!(await exists(join(packageRoot(home), value.entrypoint)))) return undefined;
    return value as InstallManifest;
  } catch { return undefined; }
}

async function defaultInstaller(destination: string): Promise<{ entrypoint: string; version: string }> {
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, "package.json"), `${JSON.stringify({ private: true }, null, 2)}\n`, "utf8");
  const child = Bun.spawn({ cmd: [process.execPath, "add", "--exact", `${PACKAGE_NAME}@${PACKAGE_VERSION}`], cwd: destination, stdout: "ignore", stderr: "ignore", env: { ...process.env } });
  if (await child.exited !== 0) throw new Error("sidecar-install-failed");
  return { entrypoint: "node_modules/@bitkyc08/opencodex/bin/ocx.mjs", version: PACKAGE_VERSION };
}

export async function installOpenCodexSidecar(options: { home: string; installer?: SidecarInstaller }): Promise<(Present & { version: string; alreadyInstalled?: true }) | Failure> {
  const pkg = packageRoot(options.home);
  const manifest = manifestPath(options.home);
  const current = await readManifest(options.home);
  if (current) return { status: "PRESENT", version: current.packageVersion, alreadyInstalled: true };
  if (await exists(pkg) || await exists(manifest)) return { status: "UNKNOWN", failClosed: true, reason: "sidecar-half-installed" };
  const staged = `${pkg}.installing-${process.pid}`;
  await mkdir(sidecarRoot(options.home), { recursive: true });
  try {
    const installed = await (options.installer ?? defaultInstaller)(staged);
    if (installed.version !== PACKAGE_VERSION || !safeRelativeEntrypoint(installed.entrypoint) || !(await exists(join(staged, installed.entrypoint)))) throw new Error("sidecar-install-unverified");
    await rename(staged, pkg);
    await writeOwnedJson(manifest, { version: 1, package: PACKAGE_NAME, packageVersion: PACKAGE_VERSION, entrypoint: installed.entrypoint, activated: false } satisfies InstallManifest, options.home);
    return { status: "PRESENT", version: PACKAGE_VERSION };
  } catch {
    await rm(staged, { recursive: true, force: true }).catch(() => undefined);
    return { status: "UNKNOWN", failClosed: true, reason: "sidecar-install-failed" };
  }
}

function live(pid: number): boolean { try { kill(pid, 0); return true; } catch { return false; } }

async function readProcessState(home: string): Promise<ProcessState | undefined> {
  const path = processPath(home);
  if (!(await isOwnedJson(path))) return undefined;
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<ProcessState>;
    if (typeof value.pid !== "number" || !Number.isSafeInteger(value.pid) || value.pid <= 0 || typeof value.port !== "number" || !Number.isInteger(value.port)) return undefined;
    return value as ProcessState;
  } catch { return undefined; }
}

export async function inspectOpenCodexSidecar(home: string): Promise<{ status: "PRESENT" | "MISSING" | "UNKNOWN"; installed: boolean; running: boolean; failClosed?: true; reason?: string; port?: number }> {
  const packagePresent = await exists(packageRoot(home));
  const manifestPresent = await exists(manifestPath(home));
  if (!packagePresent && !manifestPresent) return { status: "MISSING", installed: false, running: false };
  if (!(await readManifest(home))) return { status: "UNKNOWN", installed: false, running: false, failClosed: true, reason: "sidecar-half-installed" };
  if (!(await exists(processPath(home)))) return { status: "PRESENT", installed: true, running: false };
  const state = await readProcessState(home);
  if (!state) return { status: "UNKNOWN", installed: true, running: false, failClosed: true, reason: "sidecar-state-unverified" };
  return live(state.pid) ? { status: "PRESENT", installed: true, running: true, port: state.port } : { status: "UNKNOWN", installed: true, running: false, failClosed: true, reason: "sidecar-state-stale", port: state.port };
}

async function defaultPortInUse(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(true));
    server.once("listening", () => { server.close(() => resolve(false)); });
    server.listen(port, "127.0.0.1");
  });
}
async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs: number): Promise<boolean> { const end = Date.now() + timeoutMs; while (Date.now() < end) { if (await check()) return true; await Bun.sleep(25); } return check(); }

export async function healthOpenCodexSidecar(port: number, fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = fetch): Promise<{ status: "PRESENT"; httpStatus: 200 } | Failure> {
  try { const response = await fetchImpl(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(500) }); return response.status === 200 ? { status: "PRESENT", httpStatus: 200 } : { status: "UNKNOWN", failClosed: true, reason: "sidecar-unreachable" }; }
  catch { return { status: "UNKNOWN", failClosed: true, reason: "sidecar-unreachable" }; }
}

export async function startOpenCodexSidecar(options: { home: string; port: number; portInUse?: (port: number) => Promise<boolean>; readyTimeoutMs?: number }): Promise<(Present & { port: number }) | Failure> {
  const manifest = await readManifest(options.home);
  if (!manifest) return { status: "UNKNOWN", failClosed: true, reason: "sidecar-half-installed" };
  if (await exists(processPath(options.home))) {
    const state = await readProcessState(options.home);
    if (!state) return { status: "UNKNOWN", failClosed: true, reason: "sidecar-state-unverified" };
    return live(state.pid) ? { status: "UNKNOWN", failClosed: true, reason: "sidecar-already-started" } : { status: "UNKNOWN", failClosed: true, reason: "sidecar-state-stale" };
  }
  if (await (options.portInUse ?? defaultPortInUse)(options.port)) return { status: "UNKNOWN", failClosed: true, reason: "sidecar-port-in-use" };
  try {
    await assertNoReparsePoints(join(packageRoot(options.home), manifest.entrypoint), options.home);
    await writeOwnedJson(manifestPath(options.home), { ...manifest, activated: true }, options.home);
    const child = Bun.spawn({ cmd: [process.execPath, join(packageRoot(options.home), manifest.entrypoint), "start", "--port", String(options.port)], env: { ...process.env }, stdout: "ignore", stderr: "ignore", detached: true });
    if (!child.pid) return { status: "UNKNOWN", failClosed: true, reason: "sidecar-spawn-failed" };
    child.unref();
    await writeOwnedJson(processPath(options.home), { pid: child.pid, port: options.port }, options.home);
    if (!(await waitFor(async () => (await healthOpenCodexSidecar(options.port)).status === "PRESENT", options.readyTimeoutMs ?? 5_000))) {
      try { kill(child.pid, "SIGTERM"); } catch { /* owned pid only */ }
      await removeOwnedJson(processPath(options.home));
      return { status: "UNKNOWN", failClosed: true, reason: "sidecar-readiness-timeout" };
    }
    return { status: "PRESENT", port: options.port };
  } catch { return { status: "UNKNOWN", failClosed: true, reason: "sidecar-spawn-failed" }; }
}

export async function stopOpenCodexSidecar(home: string, timeoutMs = 3_000): Promise<(Present & { port: number }) | { status: "MISSING"; reason: "sidecar-not-started" } | Failure> {
  const path = processPath(home);
  if (!(await exists(path))) return { status: "MISSING", reason: "sidecar-not-started" };
  const state = await readProcessState(home);
  if (!state) return { status: "UNKNOWN", failClosed: true, reason: "sidecar-state-unverified" };
  if (!live(state.pid)) return { status: "UNKNOWN", failClosed: true, reason: "sidecar-state-stale" };
  try { kill(state.pid, "SIGTERM"); } catch { return { status: "UNKNOWN", failClosed: true, reason: "sidecar-state-stale" }; }
  if (!(await waitFor(() => !live(state.pid), timeoutMs))) return { status: "UNKNOWN", failClosed: true, reason: "sidecar-stop-timeout" };
  await removeOwnedJson(path);
  return { status: "PRESENT", port: state.port };
}

async function defaultCommandRunner(args: string[]): Promise<number> { const child = Bun.spawn({ cmd: args, stdout: "ignore", stderr: "ignore", env: { ...process.env } }); return child.exited; }

export async function restoreOpenCodexSidecar(home: string, run: SidecarCommandRunner = defaultCommandRunner): Promise<Present | Failure> {
  try {
    const manifest = await readManifest(home);
    if (!manifest) return { status: "UNKNOWN", failClosed: true, reason: "sidecar-half-installed" };
    if (!manifest.activated) return { status: "PRESENT" };
    if (await run([process.execPath, join(packageRoot(home), manifest.entrypoint), "restore"]) !== 0) return { status: "UNKNOWN", failClosed: true, reason: "sidecar-restore-failed" };
    await writeOwnedJson(manifestPath(home), { ...manifest, activated: false }, home);
    return { status: "PRESENT" };
  } catch {
    return { status: "UNKNOWN", failClosed: true, reason: "sidecar-restore-failed" };
  }
}

export async function uninstallOpenCodexSidecar(home: string, run: SidecarCommandRunner = defaultCommandRunner): Promise<Present | Failure> {
  try {
    const inspection = await inspectOpenCodexSidecar(home);
    if (inspection.status !== "PRESENT" || !inspection.installed || inspection.running) return { status: "UNKNOWN", failClosed: true, reason: "sidecar-uninstall-blocked" };
    const restored = await restoreOpenCodexSidecar(home, run);
    if (restored.status !== "PRESENT") return restored;
    if (!(await isOwnedJson(manifestPath(home)))) return { status: "UNKNOWN", failClosed: true, reason: "sidecar-uninstall-blocked" };
    await assertNoReparsePoints(packageRoot(home), home);
    await rm(packageRoot(home), { recursive: true, force: true });
    await removeOwnedJson(manifestPath(home));
    return { status: "PRESENT" };
  } catch {
    return { status: "UNKNOWN", failClosed: true, reason: "sidecar-uninstall-blocked" };
  }
}
