import { expect, test } from "bun:test";
import { join } from "node:path";
import { parseCliArgs } from "../src/cli/commands";
import { legacyEnvironmentFailure, runLocalLifecycleCommand, type LocalLifecycleDependencies } from "../src/cli/local-lifecycle";
import { runCostGuardDemo } from "../src/demo";

test("costguard CLI exposes exactly the MVP lifecycle commands including demo", () => {
  for (const command of ["install", "start", "status", "doctor", "sync", "stop", "restore", "uninstall", "demo"]) {
    expect(parseCliArgs([command])).toMatchObject({ command });
  }
});

test("doctor rejects legacy SaveToken environment with stable migration guidance", () => {
  expect(legacyEnvironmentFailure({ SAVETOKEN_HOME: "legacy" })).toEqual({
    status: "UNKNOWN",
    failClosed: true,
    reason: "legacy-savetoken-environment-detected",
    migration: "replace SAVETOKEN_* with COSTGUARD_*; legacy variables are not runtime aliases",
  });
  expect(legacyEnvironmentFailure({ COSTGUARD_HOME: "current" })).toBeUndefined();
});

test("local lifecycle starts sidecar before runtime and stops runtime before sidecar", async () => {
  const calls: string[] = [];
  const deps: LocalLifecycleDependencies = {
    installSidecar: async () => { calls.push("sidecar.install"); return { status: "PRESENT" }; },
    startSidecar: async () => { calls.push("sidecar.start"); return { status: "PRESENT" }; },
    startRuntime: async () => { calls.push("runtime.start"); return { status: "PRESENT" }; },
    inspectSidecar: async () => ({ status: "PRESENT", installed: true, running: true }),
    inspectRuntime: async () => "live",
    stopRuntime: async () => { calls.push("runtime.stop"); return { status: "PRESENT" }; },
    stopSidecar: async () => { calls.push("sidecar.stop"); return { status: "PRESENT" }; },
    restoreSidecar: async () => { calls.push("sidecar.restore"); return { status: "PRESENT" }; },
    uninstallSidecar: async () => { calls.push("sidecar.uninstall"); return { status: "PRESENT" }; },
  };
  expect(await runLocalLifecycleCommand("install", deps)).toMatchObject({ status: "PRESENT" });
  expect(await runLocalLifecycleCommand("start", deps)).toMatchObject({ status: "PRESENT" });
  expect(await runLocalLifecycleCommand("stop", deps)).toMatchObject({ status: "PRESENT" });
  expect(await runLocalLifecycleCommand("uninstall", deps)).toMatchObject({ status: "PRESENT" });
  expect(calls).toEqual(["sidecar.install", "sidecar.start", "runtime.start", "runtime.stop", "sidecar.stop", "runtime.stop", "sidecar.stop", "sidecar.restore", "sidecar.uninstall"]);
});

test("local lifecycle never starts runtime after a sidecar failure", async () => {
  let runtimeStarts = 0;
  const failure = { status: "UNKNOWN" as const, failClosed: true as const, reason: "sidecar-unreachable" };
  const deps = {
    installSidecar: async () => ({ status: "PRESENT" as const }),
    startSidecar: async () => failure,
    startRuntime: async () => { runtimeStarts += 1; return { status: "PRESENT" as const }; },
    inspectSidecar: async () => ({ status: "MISSING" as const, installed: false, running: false }),
    inspectRuntime: async () => "missing" as const,
    stopRuntime: async () => ({ status: "MISSING" as const }),
    stopSidecar: async () => ({ status: "MISSING" as const }),
    restoreSidecar: async () => ({ status: "PRESENT" as const }),
    uninstallSidecar: async () => ({ status: "PRESENT" as const }),
  };
  expect(await runLocalLifecycleCommand("start", deps)).toEqual(failure);
  expect(runtimeStarts).toBe(0);
});

test("demo is credential-free, uses loopback runtime, and proves high-risk no-downgrade", async () => {
  const result = await runCostGuardDemo();
  expect(result.status).toBe("PRESENT");
  expect(result.notice).toBe("演示，非真实 Provider");
  expect(result.baseUrls.every((url) => new URL(url).hostname === "127.0.0.1")).toBe(true);
  expect(result.cases).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "high-risk-no-downgrade", httpStatus: 503, status: "UNKNOWN", reason: "task-tier-candidate-mismatch" }),
    expect.objectContaining({ id: "low-risk-execution", httpStatus: 200, status: "completed" }),
  ]));
  expect(JSON.stringify(result)).not.toMatch(/api[_-]?key|cookie|private[_-]?key|bearer\s+|token["']?\s*:/i);
});

test("installed costguard bin executes the CLI entrypoint instead of silently importing it", async () => {
  const child = Bun.spawn({
    cmd: [process.execPath, "bin/costguard.mjs", "demo", "--json"],
    cwd: join(import.meta.dir, ".."),
    env: { PATH: process.env.PATH ?? "" },
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(await child.exited).toBe(0);
  const output = JSON.parse(await new Response(child.stdout).text()) as Record<string, unknown>;
  expect(output).toMatchObject({ status: "PRESENT", notice: "演示，非真实 Provider" });
  expect(await new Response(child.stderr).text()).toBe("");
});
