import { expect, test } from "bun:test";
import { readFile, access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWriteOwnedJson } from "../src/config/homes";
import { restoreOwnedState, uninstallOwnedState } from "../src/config/lifecycle";

test("uninstall removes only SaveToken-owned state and preserves user files", async () => {
  const home = await mkdtemp(join(tmpdir(), "savetoken-lifecycle-"));
  const owned = join(home, "runtime.json");
  const user = join(home, "user-not-owned.json");
  await atomicWriteOwnedJson(owned, { status: "ready" });
  await writeFile(user, "user\n", "utf8");

  expect(await uninstallOwnedState(home)).toEqual({ status: "PRESENT", removed: 1 });
  await expect(access(owned)).rejects.toThrow();
  expect(await readFile(user, "utf8")).toBe("user\n");
});

test("restore reports an absent owned backup instead of inventing one", async () => {
  const home = await mkdtemp(join(tmpdir(), "savetoken-lifecycle-"));
  expect(await restoreOwnedState(home)).toEqual({ status: "MISSING", reason: "catalog-backup-not-found" });
});
