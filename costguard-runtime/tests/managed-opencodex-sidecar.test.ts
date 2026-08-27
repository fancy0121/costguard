import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  healthOpenCodexSidecar,
  installOpenCodexSidecar,
  inspectOpenCodexSidecar,
  restoreOpenCodexSidecar,
  startOpenCodexSidecar,
  stopOpenCodexSidecar,
  uninstallOpenCodexSidecar,
} from "../src/sidecar/opencodex-managed";

async function home(): Promise<string> {
  return mkdtemp(join(tmpdir(), "costguard-sidecar-"));
}

test("managed sidecar install is atomic, owned, and idempotent", async () => {
  const root = await home();
  const install = () => installOpenCodexSidecar({
    home: root,
    installer: async (destination) => {
      await mkdir(join(destination, "bin"), { recursive: true });
      await writeFile(join(destination, "bin", "ocx.mjs"), "fixture\n", "utf8");
      return { entrypoint: "bin/ocx.mjs", version: "2.11.0" };
    },
  });
  expect(await install()).toMatchObject({ status: "PRESENT", version: "2.11.0" });
  expect(await install()).toMatchObject({ status: "PRESENT", version: "2.11.0", alreadyInstalled: true });
  expect(await inspectOpenCodexSidecar(root)).toMatchObject({ status: "PRESENT", installed: true, running: false });
  expect(await readFile(join(root, "sidecar", "install.json.owner"), "utf8")).toBe("costguard\n");
});

test("managed sidecar fails closed on a half installation", async () => {
  const root = await home();
  await mkdir(join(root, "sidecar", "package"), { recursive: true });
  expect(await installOpenCodexSidecar({ home: root, installer: async () => { throw new Error("must-not-run"); } }))
    .toEqual({ status: "UNKNOWN", failClosed: true, reason: "sidecar-half-installed" });
});

test("managed sidecar refuses occupied ports and stale process state", async () => {
  const root = await home();
  await installOpenCodexSidecar({ home: root, installer: async (destination) => {
    await mkdir(join(destination, "bin"), { recursive: true });
    await writeFile(join(destination, "bin", "ocx.mjs"), "fixture\n", "utf8");
    return { entrypoint: "bin/ocx.mjs", version: "2.11.0" };
  } });
  expect(await startOpenCodexSidecar({ home: root, port: 10100, portInUse: async () => true }))
    .toEqual({ status: "UNKNOWN", failClosed: true, reason: "sidecar-port-in-use" });
  await writeFile(join(root, "sidecar", "process.json"), '{"pid":999999,"port":10100}\n', "utf8");
  await writeFile(join(root, "sidecar", "process.json.owner"), "costguard\n", "utf8");
  expect(await startOpenCodexSidecar({ home: root, port: 10100, portInUse: async () => false }))
    .toEqual({ status: "UNKNOWN", failClosed: true, reason: "sidecar-state-unverified" });
});

test("managed sidecar health reports only bounded loopback state", async () => {
  expect(await healthOpenCodexSidecar(10100, async () => new Response('{"status":"ok","token":"hidden"}', { status: 200 })))
    .toEqual({ status: "PRESENT", httpStatus: 200 });
  expect(await healthOpenCodexSidecar(10100, async () => { throw new Error("private detail"); }))
    .toEqual({ status: "UNKNOWN", failClosed: true, reason: "sidecar-unreachable" });
});

test("restore and uninstall skip external restore when the managed sidecar was never activated", async () => {
  const root = await home();
  const calls: string[][] = [];
  await installOpenCodexSidecar({ home: root, installer: async (destination) => {
    await mkdir(join(destination, "bin"), { recursive: true });
    await writeFile(join(destination, "bin", "ocx.mjs"), "fixture\n", "utf8");
    return { entrypoint: "bin/ocx.mjs", version: "2.11.0" };
  } });
  expect(await restoreOpenCodexSidecar(root, async (args) => { calls.push(args); return 0; })).toEqual({ status: "PRESENT" });
  expect(await stopOpenCodexSidecar(root)).toEqual({ status: "MISSING", reason: "sidecar-not-started" });
  expect(await uninstallOpenCodexSidecar(root, async (args) => { calls.push(args); return 0; })).toEqual({ status: "PRESENT" });
  expect(calls).toEqual([]);
  expect(await inspectOpenCodexSidecar(root)).toEqual({ status: "MISSING", installed: false, running: false });
});

test("managed sidecar rejects a non-positive pid in owned process state", async () => {
  const root = await home();
  await installOpenCodexSidecar({ home: root, installer: async (destination) => {
    await mkdir(join(destination, "bin"), { recursive: true });
    await writeFile(join(destination, "bin", "ocx.mjs"), "fixture\n", "utf8");
    return { entrypoint: "bin/ocx.mjs", version: "2.11.0" };
  } });
  const content = '{"pid":0,"port":10100}\n';
  const digest = createHash("sha256").update(content, "utf8").digest("hex");
  await writeFile(join(root, "sidecar", "process.json"), content, "utf8");
  await writeFile(join(root, "sidecar", "process.json.owner"), "costguard\n", "utf8");
  await writeFile(join(root, "sidecar", "process.json.owner.sha256"), `${digest}\n`, "utf8");
  const inspection = await inspectOpenCodexSidecar(root);
  expect(inspection.status).toBe("UNKNOWN");
  expect(inspection.running).toBe(false);
});

test("managed sidecar refuses to spawn through a reparse point", async () => {
  const root = await home();
  const outside = await mkdtemp(join(tmpdir(), "costguard-sidecar-outside-"));
  await installOpenCodexSidecar({ home: root, installer: async (destination) => {
    await mkdir(join(destination, "bin"), { recursive: true });
    await writeFile(join(destination, "bin", "ocx.mjs"), "fixture\n", "utf8");
    return { entrypoint: "bin/ocx.mjs", version: "2.11.0" };
  } });
  await rm(join(root, "sidecar", "package"), { recursive: true, force: true });
  await mkdir(join(outside, "bin"), { recursive: true });
  await writeFile(join(outside, "bin", "ocx.mjs"), "MARKER\n", "utf8");
  await symlink(outside, join(root, "sidecar", "package"), "junction");
  const result = await startOpenCodexSidecar({ home: root, port: 10100, portInUse: async () => false });
  expect(result.status).toBe("UNKNOWN");
  expect((result as { failClosed?: boolean }).failClosed).toBe(true);
});
