import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWriteOwnedJson, resolveHomes } from "../src/config/homes";

describe("configuration ownership", () => {
  test("resolves explicit isolated homes without consulting the real home", () => {
    const homes = resolveHomes({
      CODEX_HOME: "C:/isolated/codex",
      COSTGUARD_HOME: "C:/isolated/costguard",
      OPENCODEX_HOME: "C:/isolated/opencodex",
      USERPROFILE: "C:/real-user",
    });

    expect(homes.codexHome).toBe("C:/isolated/codex");
    expect(homes.costGuardHome).toBe("C:/isolated/costguard");
    expect(homes.openCodexHome).toBe("C:/isolated/opencodex");
  });

  test("writes owned JSON atomically and leaves no temporary residue", async () => {
    const home = await mkdtemp(join(tmpdir(), "costguard-config-"));
    const target = join(home, "config.json");

    await atomicWriteOwnedJson(target, { provider: "openai", mode: "isolated" });

    expect(JSON.parse(await readFile(target, "utf8"))).toEqual({ provider: "openai", mode: "isolated" });
    expect(await readFile(`${target}.owner`, "utf8")).toBe("costguard\n");
    expect((await Array.fromAsync(new Bun.Glob("config.json.*.tmp").scan({ cwd: home }))).length).toBe(0);
  });
});
