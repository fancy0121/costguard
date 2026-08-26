import { expect, test } from "bun:test";
import { cliExitCode, parseCliArgs, renderCliResult, runCli } from "../src/cli/commands";
import { createServicePlan } from "../src/service/lifecycle";
import { resolveCliBaseUrl } from "../src/cli/main";

test("CLI parser exposes safe lifecycle commands without implicit mutation", () => {
  expect(parseCliArgs(["status", "--json"])).toEqual({ command: "status", json: true });
  expect(parseCliArgs(["uninstall"])).toEqual({ command: "uninstall", json: false });
  expect(parseCliArgs(["unknown"])).toEqual({ status: "UNKNOWN", reason: "cli-command-unrecognized" });
});

test("CLI delegates management commands through an explicit request boundary", async () => {
  const calls: string[] = [];
  const result = await runCli(["restore"], async (path, method) => {
    calls.push(`${method} ${path}`);
    return { status: 200, body: { status: "PRESENT" } };
  });

  expect(result).toEqual({ status: "PRESENT" });
  expect(calls).toEqual(["POST /api/restore"]);
});

test("service plans are platform-specific but never claim installation was executed", () => {
  expect(createServicePlan("windows", "install", "C:/costguard-runtime")).toMatchObject({
    status: "NOT_TESTED",
    platform: "windows",
    action: "install",
    executed: false,
  });
  const linuxPlan = createServicePlan("linux", "uninstall", "/opt/costguard-runtime");
  if (linuxPlan.status !== "NOT_TESTED") throw new Error("unexpected service plan");
  expect(linuxPlan.executed).toBe(false);
});

test("service and shim plans cover reversible lifecycle actions without executing them", () => {
  for (const platform of ["windows", "macos", "linux"] as const) {
    for (const action of ["install", "start", "stop", "restart", "upgrade", "rollback", "uninstall"] as const) {
      const plan = createServicePlan(platform, action, "C:/isolated/costguard");
      expect(plan).toMatchObject({ status: "NOT_TESTED", platform, action, executed: false });
      if (plan.status !== "NOT_TESTED") throw new Error("unexpected service plan");
      expect(plan.commands).toHaveLength(2);
      expect(plan.commands.join(" ")).toContain("shim:");
    }
  }
});

test("service planning rejects command-like runtime roots instead of emitting an executable-looking plan", () => {
  expect(createServicePlan("windows", "install", "C:/isolated;unexpected")).toEqual({
    status: "UNKNOWN",
    failClosed: true,
    reason: "service-runtime-root-invalid",
  });
});

test("CLI reports network failures as fail-closed results and honors --json", async () => {
  await expect(runCli(["status"], async () => { throw new Error("fixture network failure"); })).resolves.toEqual({
    status: "UNKNOWN",
    failClosed: true,
    reason: "management-request-failed",
  });
  expect(renderCliResult(["status", "--json"], { status: "PRESENT" })).toBe('{"status":"PRESENT"}');
  expect(renderCliResult(["status"], { status: "PRESENT" })).toBe("status: PRESENT");
});

test("CLI derives the runtime port from environment and prefers an explicit base URL", () => {
  expect(resolveCliBaseUrl({ COSTGUARD_PORT: "8789" })).toBe("http://127.0.0.1:8789");
  expect(resolveCliBaseUrl({ COSTGUARD_PORT: "bad" })).toBe("http://127.0.0.1:8787");
  expect(resolveCliBaseUrl({ COSTGUARD_BASE_URL: "http://127.0.0.1:9999", COSTGUARD_PORT: "8789" })).toBe("http://127.0.0.1:9999");
});

test("CLI returns a nonzero exit code for UNKNOWN results", () => {
  expect(cliExitCode({ status: "UNKNOWN", failClosed: true })).toBe(1);
  expect(cliExitCode({ status: "PRESENT" })).toBe(0);
  expect(cliExitCode({ ready: { status: "ready" } })).toBe(0);
});
