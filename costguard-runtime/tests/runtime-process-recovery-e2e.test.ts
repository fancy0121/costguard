import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRuntimeProcess, stopRuntimeProcess } from "../src/cli/process";
import { atomicWriteOwnedJson } from "../src/config/homes";

test("local runtime process lifecycle writes isolated state, rejects duplicate start, and removes state on stop", async () => {
  const root = await mkdtemp(join(tmpdir(), "costguard-process-"));
  const port = 18987;
  try {
    const started = await startRuntimeProcess({ home: root, port, providers: {} });
    expect(started).toMatchObject({ status: "PRESENT", port });
    expect(JSON.parse(await readFile(join(root, "process.json"), "utf8"))).toMatchObject({ port });
    expect(await startRuntimeProcess({ home: root, port, providers: {} })).toEqual({ status: "UNKNOWN", failClosed: true, reason: "runtime-already-started" });
    expect(await stopRuntimeProcess(root)).toEqual({ status: "PRESENT", port });
    await expect(readFile(join(root, "process.json"), "utf8")).rejects.toBeTruthy();
  } finally {
    await stopRuntimeProcess(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("stale isolated process state is fail-closed and doctor-readable rather than killed by guessed PID", async () => {
  const root = await mkdtemp(join(tmpdir(), "costguard-stale-process-"));
  try {
    await atomicWriteOwnedJson(join(root, "process.json"), { pid: 999999, port: 18988 });
    expect(await stopRuntimeProcess(root)).toEqual({ status: "UNKNOWN", failClosed: true, reason: "runtime-state-stale" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("unowned process state is fail-closed before any PID operation", async () => {
  const root = await mkdtemp(join(tmpdir(), "costguard-unowned-process-"));
  await (await import("node:fs/promises")).writeFile(join(root, "process.json"), '{"pid":999999,"port":18988}\n', "utf8");
  try {
    expect(await stopRuntimeProcess(root)).toEqual({ status: "UNKNOWN", failClosed: true, reason: "runtime-state-unverified" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
