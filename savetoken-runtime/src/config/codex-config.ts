import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicWriteOwnedJson, isOwnedJson } from "./homes";

const markerStart = "# >>> savetoken managed proxy >>>";
const markerEnd = "# <<< savetoken managed proxy <<<";
const configName = "config.toml";
const stateName = ".savetoken-codex-config.json";
const journalName = ".savetoken-codex-config.journal";

export type ManagedConfigResult =
  | { status: "PRESENT" }
  | { status: "MISSING"; reason: "managed-config-not-found" }
  | { status: "UNKNOWN"; reason: "managed-config-conflict" | "managed-config-format-invalid" | "managed-config-unverified" | "managed-config-io-failed" };

type ManagedConfigState = {
  version: 1;
  preHash: string;
  postHash: string;
  blockHash: string;
};

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function paths(codexHome: string, saveTokenHome: string) {
  return { config: join(codexHome, configName), state: join(saveTokenHome, stateName), journal: join(saveTokenHome, journalName) };
}

async function refuseSymlink(path: string): Promise<void> {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error("symlink");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function normalise(content: string): { value: string; eol: "\n" | "\r\n" } {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  return { value: content.replace(/\r\n/g, "\n"), eol };
}

function rootEnd(lines: string[]): number {
  const table = lines.findIndex((line) => /^\s*\[/.test(line));
  return table < 0 ? lines.length : table;
}

function managedRange(lines: string[]): { start: number; end: number } | "absent" | "invalid" {
  const starts = lines.map((line, index) => line === markerStart ? index : -1).filter((index) => index >= 0);
  const ends = lines.map((line, index) => line === markerEnd ? index : -1).filter((index) => index >= 0);
  if (starts.length === 0 && ends.length === 0) return "absent";
  if (starts.length !== 1 || ends.length !== 1 || starts[0] >= ends[0]) return "invalid";
  return { start: starts[0], end: ends[0] };
}

function blockIsSafe(lines: string[], range: { start: number; end: number }): boolean {
  return range.end === range.start + 2
    && /^openai_base_url\s*=\s*"http:\/\/(127\.0\.0\.1|localhost|\[::1\]):[0-9]+\/v1"$/.test(lines[range.start + 1])
    && range.end < rootEnd(lines);
}

function buildInjected(original: string, baseUrl: string): { value: string; block: string } | ManagedConfigResult {
  const { value, eol } = normalise(original);
  // This bounded editor intentionally does not parse multiline TOML strings. Refuse rather than
  // mistake a table-looking line inside one for a root table boundary.
  if (value.includes('"""') || value.includes("'''")) return { status: "UNKNOWN", reason: "managed-config-format-invalid" };
  const lines = value.split("\n");
  const range = managedRange(lines);
  if (range === "invalid" || range !== "absent") return { status: "UNKNOWN", reason: "managed-config-format-invalid" };
  const end = rootEnd(lines);
  for (let index = 0; index < end; index += 1) {
    if (/^\s*openai_base_url\s*=/.test(lines[index])) return { status: "UNKNOWN", reason: "managed-config-conflict" };
  }
  const block = [markerStart, `openai_base_url = "${baseUrl}/v1"`, markerEnd].join("\n");
  const next = [...lines.slice(0, end), ...block.split("\n"), ...lines.slice(end)].join("\n");
  return { value: eol === "\n" ? next : next.replace(/\n/g, "\r\n"), block };
}

function removeInjected(current: string, expectedBlockHash: string): string | undefined {
  const { value, eol } = normalise(current);
  const lines = value.split("\n");
  const range = managedRange(lines);
  if (typeof range !== "object" || !blockIsSafe(lines, range)) return undefined;
  const block = lines.slice(range.start, range.end + 1).join("\n");
  if (hash(block) !== expectedBlockHash) return undefined;
  const restored = [...lines.slice(0, range.start), ...lines.slice(range.end + 1)].join("\n");
  return eol === "\n" ? restored : restored.replace(/\n/g, "\r\n");
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function removeOwned(path: string): Promise<void> {
  await unlink(path);
  await unlink(`${path}.owner`).catch(() => undefined);
  await unlink(`${path}.owner.sha256`).catch(() => undefined);
}

function validState(value: unknown): value is ManagedConfigState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<ManagedConfigState>;
  return state.version === 1 && [state.preHash, state.postHash, state.blockHash].every((item) => typeof item === "string" && /^[a-f0-9]{64}$/.test(item));
}

async function loadState(path: string): Promise<ManagedConfigState | undefined> {
  try {
    if (!(await isOwnedJson(path))) return undefined;
    const value = JSON.parse(await readFile(path, "utf8"));
    return validState(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Resolve only a journal whose pre/post image hashes match the actual isolated config bytes. */
export async function recoverManagedCodexConfigJournal(codexHome: string, saveTokenHome: string): Promise<ManagedConfigResult> {
  const { config, state, journal } = paths(codexHome, saveTokenHome);
  const journalExists = await readFile(journal, "utf8").then(() => true).catch(() => false);
  if (!journalExists) return { status: "MISSING", reason: "managed-config-not-found" };
  const pending = await loadState(journal);
  if (!pending) return { status: "UNKNOWN", reason: "managed-config-format-invalid" };
  try {
    await refuseSymlink(config);
    const current = await readFile(config, "utf8");
    if (hash(current) === pending.postHash) {
      const existing = await loadState(state);
      if (existing && (existing.postHash !== pending.postHash || existing.preHash !== pending.preHash)) return { status: "UNKNOWN", reason: "managed-config-unverified" };
      if (!existing) await atomicWriteOwnedJson(state, pending);
      await removeOwned(journal);
      return { status: "PRESENT" };
    }
    if (hash(current) === pending.preHash) {
      await removeOwned(journal);
      return { status: "PRESENT" };
    }
    return { status: "UNKNOWN", reason: "managed-config-unverified" };
  } catch {
    return { status: "UNKNOWN", reason: "managed-config-io-failed" };
  }
}

/** Validate an isolated config target before another lifecycle target is changed. */
export async function preflightManagedCodexConfig(codexHome: string, saveTokenHome: string, baseUrl: string): Promise<ManagedConfigResult> {
  let parsed: URL;
  try { parsed = new URL(baseUrl); } catch { return { status: "UNKNOWN", reason: "managed-config-format-invalid" }; }
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]", "::1"].includes(parsed.hostname) || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) {
    return { status: "UNKNOWN", reason: "managed-config-format-invalid" };
  }
  const { config, state, journal } = paths(codexHome, saveTokenHome);
  try {
    await refuseSymlink(config);
    if (await readFile(journal, "utf8").then(() => true).catch(() => false)) return { status: "UNKNOWN", reason: "managed-config-unverified" };
    const original = await readFile(config, "utf8").catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    });
    const existing = await loadState(state);
    if (existing) return hash(original) === existing.postHash ? { status: "PRESENT" } : { status: "UNKNOWN", reason: "managed-config-unverified" };
    const built = buildInjected(original, baseUrl);
    return "status" in built ? built : { status: "PRESENT" };
  } catch {
    return { status: "UNKNOWN", reason: "managed-config-io-failed" };
  }
}

export async function injectManagedCodexConfig(codexHome: string, saveTokenHome: string, baseUrl: string): Promise<ManagedConfigResult> {
  let parsed: URL;
  try { parsed = new URL(baseUrl); } catch { return { status: "UNKNOWN", reason: "managed-config-format-invalid" }; }
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]", "::1"].includes(parsed.hostname) || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) {
    return { status: "UNKNOWN", reason: "managed-config-format-invalid" };
  }
  const { config, state, journal } = paths(codexHome, saveTokenHome);
  try {
    const recovered = await recoverManagedCodexConfigJournal(codexHome, saveTokenHome);
    if (recovered.status === "UNKNOWN") return recovered;
    const preflight = await preflightManagedCodexConfig(codexHome, saveTokenHome, baseUrl);
    if (preflight.status !== "PRESENT") return preflight;
    const original = await readFile(config, "utf8").catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    });
    const existing = await loadState(state);
    if (existing) return hash(original) === existing.postHash ? { status: "PRESENT" } : { status: "UNKNOWN", reason: "managed-config-unverified" };
    const built = buildInjected(original, baseUrl);
    if ("status" in built) return built;
    const pending: ManagedConfigState = { version: 1, preHash: hash(original), postHash: hash(built.value), blockHash: hash(built.block) };
    await atomicWriteOwnedJson(journal, pending);
    await atomicWrite(config, built.value);
    await atomicWriteOwnedJson(state, pending);
    await removeOwned(journal);
    return { status: "PRESENT" };
  } catch {
    return { status: "UNKNOWN", reason: "managed-config-io-failed" };
  }
}

export async function restoreManagedCodexConfig(codexHome: string, saveTokenHome: string): Promise<ManagedConfigResult> {
  const { config, state } = paths(codexHome, saveTokenHome);
  const managed = await loadState(state);
  if (!managed) {
    const stateExists = await readFile(state, "utf8").then(() => true).catch(() => false);
    return stateExists ? { status: "UNKNOWN", reason: "managed-config-format-invalid" } : { status: "MISSING", reason: "managed-config-not-found" };
  }
  try {
    await refuseSymlink(config);
    const current = await readFile(config, "utf8");
    if (hash(current) !== managed.postHash) return { status: "UNKNOWN", reason: "managed-config-unverified" };
    const restored = removeInjected(current, managed.blockHash);
    if (restored === undefined || hash(restored) !== managed.preHash) return { status: "UNKNOWN", reason: "managed-config-unverified" };
    await atomicWrite(config, restored);
    await removeOwned(state);
    return { status: "PRESENT" };
  } catch {
    return { status: "UNKNOWN", reason: "managed-config-io-failed" };
  }
}
