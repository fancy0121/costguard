import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRuntime } from "../src/server/runtime";
import { atomicWriteOwnedJson } from "../src/config/homes";

test("isolated management sync recovers an exact managed-config journal before touching the catalog", async () => {
  const root = await mkdtemp(join(tmpdir(), "savetoken-crash-e2e-"));
  const codexHome = join(root, "codex");
  const saveTokenHome = join(root, "state");
  const token = ["fixture", "crash", "recovery"].join("-");
  const runtime = await startRuntime({
    env: { CODEX_HOME: codexHome, SAVETOKEN_HOME: saveTokenHome },
    providers: { fixture: ["model-a"] }, managementToken: token, providerTier: "execution",
    providerAdapters: [{ descriptor: { id: "fixture", models: ["model-a"], auth: "fixture", health: "healthy", tier: "execution", capabilities: ["responses"] }, invoke: async ({ requestedModel }) => ({ status: "PRESENT", actualRuntimeModel: requestedModel }) }],
    taskSignals: () => ({ text: "extract isolated records", isBatchOrRepetitive: true }),
  });
  const management = (path: string) => fetch(runtime.baseUrl + path, { method: "POST", headers: { authorization: `Bearer ${token}` } });
  const state = join(saveTokenHome, ".savetoken-codex-config.json");
  const journal = join(saveTokenHome, ".savetoken-codex-config.journal");
  try {
    expect((await management("/api/install")).status).toBe(200);
    const saved = JSON.parse(await readFile(state, "utf8"));
    await atomicWriteOwnedJson(journal, saved);
    await unlink(state);

    const recovered = await management("/api/sync");
    expect(recovered.status).toBe(200);
    expect(JSON.parse(await readFile(state, "utf8"))).toMatchObject(saved);
    await expect(readFile(journal, "utf8")).rejects.toThrow();
  } finally { runtime.stop(); await rm(root, { recursive: true, force: true }); }
});
