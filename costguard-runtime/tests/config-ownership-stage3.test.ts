import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWriteOwnedJson, atomicWriteOwnedJsonBatch, isOwnedJson, recoverOwnedJsonBatch } from "../src/config/homes";
import { uninstallOwnedState } from "../src/config/lifecycle";

test("atomic owned writes refuse to overwrite an unowned target", async () => {
  const home = await mkdtemp(join(tmpdir(), "costguard-ownership-"));
  const target = join(home, "config.json");
  await writeFile(target, "user\n", "utf8");

  await expect(atomicWriteOwnedJson(target, { costGuard: true })).rejects.toThrow("target-not-owned");
  expect(await readFile(target, "utf8")).toBe("user\n");
});

test("atomic owned writes reject a junction that escapes the intended directory", async () => {
  const home = await mkdtemp(join(tmpdir(), "costguard-ownership-single-junction-"));
  const outside = await mkdtemp(join(tmpdir(), "costguard-ownership-single-outside-"));
  const junction = join(home, "linked");
  await symlink(outside, junction, "junction");

  await expect(atomicWriteOwnedJson(join(junction, "escaped.json"), { costGuard: true })).rejects.toThrow("target-reparse-point-forbidden");
  await expect(readFile(join(outside, "escaped.json"), "utf8")).rejects.toThrow();
});

test("uninstall refuses to delete a CostGuard file edited after ownership was recorded", async () => {
  const home = await mkdtemp(join(tmpdir(), "costguard-ownership-"));
  const target = join(home, "config.json");
  await atomicWriteOwnedJson(target, { costGuard: true });
  await writeFile(target, "user-edit\n", "utf8");

  expect(await uninstallOwnedState(home)).toEqual({ status: "UNKNOWN", reason: "owned-state-unverified" });
  expect(await readFile(target, "utf8")).toBe("user-edit\n");
});

test("multi-file owned writes preflight all later edits before changing any target", async () => {
  const home = await mkdtemp(join(tmpdir(), "costguard-ownership-"));
  const first = join(home, "first.json");
  const second = join(home, "second.json");
  await atomicWriteOwnedJsonBatch([
    { path: first, value: { version: 1 } },
    { path: second, value: { version: 1 } },
  ]);
  await writeFile(second, "user-edit\n", "utf8");

  await expect(atomicWriteOwnedJsonBatch([
    { path: first, value: { version: 2 } },
    { path: second, value: { version: 2 } },
  ])).rejects.toThrow("target-ownership-unverified");
  expect(JSON.parse(await readFile(first, "utf8"))).toEqual({ version: 1 });
  expect(await readFile(second, "utf8")).toBe("user-edit\n");
});

test("multi-file owned writes reject an outside target before staging a transaction", async () => {
  const home = await mkdtemp(join(tmpdir(), "costguard-ownership-root-"));
  const outside = await mkdtemp(join(tmpdir(), "costguard-ownership-outside-"));
  const escaped = join(outside, "escaped.json");

  await expect(atomicWriteOwnedJsonBatch([
    { path: join(home, "inside.json"), value: { version: 1 } },
    { path: escaped, value: { version: 1 } },
  ], { transactionRoot: home })).rejects.toThrow("target-outside-transaction-root");
  await expect(readFile(escaped, "utf8")).rejects.toThrow();
  await expect(readFile(join(home, ".costguard-owned-batch.json"), "utf8")).rejects.toThrow();
});

test("multi-file owned writes reject a junction that escapes the transaction root", async () => {
  const home = await mkdtemp(join(tmpdir(), "costguard-ownership-junction-"));
  const outside = await mkdtemp(join(tmpdir(), "costguard-ownership-junction-outside-"));
  const junction = join(home, "linked");
  await symlink(outside, junction, "junction");

  await expect(atomicWriteOwnedJsonBatch([
    { path: join(junction, "escaped.json"), value: { version: 1 } },
  ], { transactionRoot: home })).rejects.toThrow("target-reparse-point-forbidden");
  await expect(readFile(join(outside, "escaped.json"), "utf8")).rejects.toThrow();
});

test("owned batch recovery repairs only a target whose expected content hash still matches", async () => {
  const home = await mkdtemp(join(tmpdir(), "costguard-ownership-"));
  const target = join(home, "recovered.json");
  const content = `${JSON.stringify({ version: 1 }, null, 2)}\n`;
  const sha256 = createHash("sha256").update(content, "utf8").digest("hex");
  await writeFile(target, content, "utf8");
  await writeFile(join(home, ".costguard-owned-batch.json"), JSON.stringify({ version: 1, writes: [{ relativePath: "recovered.json", sha256 }] }), "utf8");

  expect(await recoverOwnedJsonBatch(home)).toEqual({ status: "PRESENT", repaired: 1 });
  expect(await isOwnedJson(target)).toBe(true);
});

test("owned batch recovery preserves a later user edit and stays UNKNOWN", async () => {
  const home = await mkdtemp(join(tmpdir(), "costguard-ownership-"));
  const target = join(home, "edited.json");
  const content = `${JSON.stringify({ version: 1 }, null, 2)}\n`;
  const sha256 = createHash("sha256").update(content, "utf8").digest("hex");
  await writeFile(target, "user-edit\n", "utf8");
  await writeFile(join(home, ".costguard-owned-batch.json"), JSON.stringify({ version: 1, writes: [{ relativePath: "edited.json", sha256 }] }), "utf8");

  expect(await recoverOwnedJsonBatch(home)).toEqual({ status: "UNKNOWN", reason: "owned-batch-recovery-unverified" });
  expect(await readFile(target, "utf8")).toBe("user-edit\n");
});

test("owned batch recovery refuses a journal target behind a transaction-root junction", async () => {
  const home = await mkdtemp(join(tmpdir(), "costguard-ownership-recovery-junction-"));
  const outside = await mkdtemp(join(tmpdir(), "costguard-ownership-recovery-outside-"));
  const junction = join(home, "linked");
  const target = join(outside, "escaped.json");
  const content = `${JSON.stringify({ version: 1 }, null, 2)}\n`;
  const sha256 = createHash("sha256").update(content, "utf8").digest("hex");
  await symlink(outside, junction, "junction");
  await writeFile(target, content, "utf8");
  await writeFile(join(home, ".costguard-owned-batch.json"), JSON.stringify({ version: 1, writes: [{ relativePath: "linked/escaped.json", sha256 }] }), "utf8");

  expect(await recoverOwnedJsonBatch(home)).toEqual({ status: "UNKNOWN", reason: "owned-batch-journal-invalid" });
  await expect(readFile(`${target}.owner`, "utf8")).rejects.toThrow();
  expect(await readFile(target, "utf8")).toBe(content);
});

test("uninstall does not follow a junction to remove owned state outside the home", async () => {
  const home = await mkdtemp(join(tmpdir(), "costguard-uninstall-junction-"));
  const outside = await mkdtemp(join(tmpdir(), "costguard-uninstall-outside-"));
  const junction = join(home, "linked");
  await symlink(outside, junction, "junction");

  const target = join(outside, "state.json");
  const content = `${JSON.stringify({ version: 1 }, null, 2)}\n`;
  const sha256 = createHash("sha256").update(content, "utf8").digest("hex");
  await writeFile(target, content, "utf8");
  await writeFile(`${target}.owner`, "costguard\n", "utf8");
  await writeFile(`${target}.owner.sha256`, `${sha256}\n`, "utf8");

  expect(await uninstallOwnedState(home)).toEqual({ status: "MISSING", reason: "no-owned-state" });
  expect(await readFile(target, "utf8")).toBe(content);
  expect(await readFile(`${target}.owner`, "utf8")).toBe("costguard\n");
  expect(await readFile(`${target}.owner.sha256`, "utf8")).toBe(`${sha256}\n`);
});
