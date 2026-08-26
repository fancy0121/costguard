export type LifecycleResult = { status: "PRESENT" | "MISSING" | "UNKNOWN"; failClosed?: true; reason?: string; [key: string]: unknown };
export type LocalLifecycleCommand = "install" | "start" | "status" | "doctor" | "stop" | "restore" | "uninstall";

export type LocalLifecycleDependencies = {
  installSidecar: () => Promise<LifecycleResult>;
  startSidecar: () => Promise<LifecycleResult>;
  startRuntime: () => Promise<LifecycleResult>;
  inspectSidecar: () => Promise<LifecycleResult>;
  inspectRuntime: () => Promise<"missing" | "live" | "stale" | "unverified">;
  stopRuntime: () => Promise<LifecycleResult>;
  stopSidecar: () => Promise<LifecycleResult>;
  restoreSidecar: () => Promise<LifecycleResult>;
  uninstallSidecar: () => Promise<LifecycleResult>;
};

const LEGACY_ENV = ["SAVETOKEN_HOME", "SAVETOKEN_PORT", "SAVETOKEN_BASE_URL", "SAVETOKEN_MANAGEMENT_TOKEN", "SAVETOKEN_PROVIDERS_JSON", "SAVETOKEN_OPENCODEX_PROXY_URL", "SAVETOKEN_DEFAULT_PROVIDER"];

export function legacyEnvironmentFailure(env: Record<string, string | undefined>): { status: "UNKNOWN"; failClosed: true; reason: "legacy-savetoken-environment-detected"; migration: string } | undefined {
  if (!LEGACY_ENV.some((name) => env[name] !== undefined)) return undefined;
  return {
    status: "UNKNOWN",
    failClosed: true,
    reason: "legacy-savetoken-environment-detected",
    migration: "replace SAVETOKEN_* with COSTGUARD_*; legacy variables are not runtime aliases",
  };
}

function failed(value: LifecycleResult): boolean { return value.status === "UNKNOWN"; }

export async function runLocalLifecycleCommand(command: LocalLifecycleCommand, deps: LocalLifecycleDependencies): Promise<LifecycleResult> {
  if (command === "install") return deps.installSidecar();
  if (command === "start") {
    const sidecar = await deps.startSidecar();
    if (failed(sidecar)) return sidecar;
    const runtime = await deps.startRuntime();
    return failed(runtime) ? runtime : { status: "PRESENT", sidecar, runtime };
  }
  if (command === "status" || command === "doctor") {
    const sidecar = await deps.inspectSidecar();
    const runtime = await deps.inspectRuntime();
    const unhealthy = sidecar.status === "UNKNOWN" || runtime === "stale" || runtime === "unverified";
    return unhealthy
      ? { status: "UNKNOWN", failClosed: true, reason: "local-lifecycle-unverified", sidecar, runtime }
      : { status: "PRESENT", sidecar, runtime };
  }
  if (command === "stop") {
    const runtime = await deps.stopRuntime();
    if (failed(runtime)) return runtime;
    const sidecar = await deps.stopSidecar();
    return failed(sidecar) ? sidecar : { status: "PRESENT", runtime, sidecar };
  }
  if (command === "restore") return deps.restoreSidecar();
  const runtime = await deps.stopRuntime();
  if (failed(runtime)) return runtime;
  const sidecar = await deps.stopSidecar();
  if (failed(sidecar)) return sidecar;
  const restored = await deps.restoreSidecar();
  if (failed(restored)) return restored;
  const uninstalled = await deps.uninstallSidecar();
  return failed(uninstalled) ? uninstalled : { status: "PRESENT", runtime, sidecar, restored, uninstalled };
}
