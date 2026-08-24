export type ServicePlatform = "windows" | "macos" | "linux";
export type ServiceAction = "install" | "start" | "stop" | "restart" | "upgrade" | "rollback" | "uninstall";

export type ServicePlan = {
  status: "NOT_TESTED";
  platform: ServicePlatform;
  action: ServiceAction;
  executed: false;
  commands: string[];
} | {
  status: "UNKNOWN";
  failClosed: true;
  reason: "service-runtime-root-invalid" | "service-platform-or-action-invalid";
};

export function createServicePlan(platform: ServicePlatform, action: ServiceAction, runtimeRoot: string): ServicePlan {
  if (!["windows", "macos", "linux"].includes(platform) || !["install", "start", "stop", "restart", "upgrade", "rollback", "uninstall"].includes(action)) {
    return { status: "UNKNOWN", failClosed: true, reason: "service-platform-or-action-invalid" };
  }
  if (!runtimeRoot || /[\r\n;&|`$<>]/.test(runtimeRoot)) {
    return { status: "UNKNOWN", failClosed: true, reason: "service-runtime-root-invalid" };
  }
  const commands = platform === "windows"
    ? [`schtasks:${action}:savetoken:${runtimeRoot}`, `shim:${action}:savetoken:${runtimeRoot}`]
    : platform === "macos"
      ? [`launchd:${action}:savetoken:${runtimeRoot}`, `shim:${action}:savetoken:${runtimeRoot}`]
      : [`systemd-user:${action}:savetoken:${runtimeRoot}`, `shim:${action}:savetoken:${runtimeRoot}`];
  return { status: "NOT_TESTED", platform, action, executed: false, commands };
}
