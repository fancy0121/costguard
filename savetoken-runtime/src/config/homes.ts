import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export type Environment = Record<string, string | undefined>;

export type EffectiveHomes = {
  codexHome: string;
  saveTokenHome: string;
  /** A pass-through isolation boundary; SaveToken does not read or write this home. */
  openCodexHome: string;
};

export function resolveHomes(env: Environment = process.env): EffectiveHomes {
  const userHome = env.USERPROFILE ?? env.HOME ?? homedir();
  return {
    codexHome: env.CODEX_HOME ?? join(userHome, ".codex"),
    saveTokenHome: env.SAVETOKEN_HOME ?? join(userHome, ".savetoken"),
    openCodexHome: env.OPENCODEX_HOME ?? join(userHome, ".opencodex"),
  };
}

let sequence = 0;

export type OwnedJsonWrite = { path: string; value: unknown };

export type OwnedJsonBatchRecoveryResult =
  | { status: "PRESENT"; repaired: number }
  | { status: "MISSING"; reason: "owned-batch-not-found" }
  | { status: "UNKNOWN"; reason: "owned-batch-recovery-unverified" | "owned-batch-journal-invalid" };

async function assertOwnedWriteTarget(path: string): Promise<void> {
  let existing: string | undefined;
  try {
    existing = await readFile(path, "utf8");
  } catch {
    return;
  }
  const marker = await readFile(`${path}.owner`, "utf8").catch(() => "");
  if (marker !== "savetoken\n") throw new Error("target-not-owned");
  const recordedHash = await readFile(`${path}.owner.sha256`, "utf8").catch(() => "");
  if (!recordedHash || hashContent(existing) !== recordedHash.trim()) throw new Error("target-ownership-unverified");
}

async function assertPathHasNoReparsePoints(path: string): Promise<void> {
  let current = resolve(path);
  while (true) {
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error("target-reparse-point-forbidden");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

function isTransactionTarget(root: string, path: string): boolean {
  const pathFromRoot = relative(root, resolve(path));
  return pathFromRoot.length > 0 && !pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot);
}

async function assertTransactionTargetIsNotReparsePoint(root: string, path: string): Promise<void> {
  const target = resolve(path);
  const targetRelative = relative(root, target);
  await assertPathHasNoReparsePoints(target);
}

export async function atomicWriteOwnedJson(path: string, value: unknown): Promise<void> {
  await assertPathHasNoReparsePoints(path);
  await mkdir(dirname(path), { recursive: true });
  await assertOwnedWriteTarget(path);
  const temp = `${path}.${process.pid}.${sequence++}.tmp`;
  const content = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(temp, content, { encoding: "utf8", mode: 0o600 });
  await rename(temp, path);
  await writeFile(`${path}.owner`, "savetoken\n", { encoding: "utf8", mode: 0o600 });
  await writeFile(`${path}.owner.sha256`, `${hashContent(content)}\n`, { encoding: "utf8", mode: 0o600 });
}

/** Stage every owned JSON payload before replacing any target. */
export async function atomicWriteOwnedJsonBatch(writes: OwnedJsonWrite[], options: { transactionRoot?: string } = {}): Promise<void> {
  if (writes.length === 0) return;
  const transactionRoot = resolve(options.transactionRoot ?? dirname(writes[0].path));
  await mkdir(transactionRoot, { recursive: true });
  const paths = new Set<string>();
  for (const write of writes) {
    if (!isTransactionTarget(transactionRoot, write.path)) throw new Error("target-outside-transaction-root");
    await assertTransactionTargetIsNotReparsePoint(transactionRoot, write.path);
    if (paths.has(write.path)) throw new Error("target-duplicate");
    paths.add(write.path);
    await mkdir(dirname(write.path), { recursive: true });
    await assertOwnedWriteTarget(write.path);
  }

  const staged = await Promise.all(writes.map(async ({ path, value }) => {
    const content = `${JSON.stringify(value, null, 2)}\n`;
    const temp = `${path}.${process.pid}.${sequence++}.tmp`;
    await writeFile(temp, content, { encoding: "utf8", mode: 0o600 });
    return { path, temp, content };
  }));
  const journal = join(transactionRoot, ".savetoken-owned-batch.json");
  const journalTemp = `${journal}.${process.pid}.${sequence++}.tmp`;
  await writeFile(journalTemp, JSON.stringify({
    version: 1,
    writes: staged.map((item) => ({ relativePath: relative(transactionRoot, resolve(item.path)), sha256: hashContent(item.content) })),
  }) + "\n", { encoding: "utf8", mode: 0o600 });
  await rename(journalTemp, journal);
  let committed = false;
  try {
    for (const item of staged) {
      await rename(item.temp, item.path);
      await writeFile(`${item.path}.owner`, "savetoken\n", { encoding: "utf8", mode: 0o600 });
      await writeFile(`${item.path}.owner.sha256`, `${hashContent(item.content)}\n`, { encoding: "utf8", mode: 0o600 });
    }
    await unlink(journal);
    committed = true;
  } finally {
    await Promise.all(staged.map((item) => unlinkIfPresent(item.temp)));
    if (!committed) await unlinkIfPresent(journalTemp);
  }
}

async function unlinkIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // The staged file may already have been renamed or never created.
  }
}

export async function recoverOwnedJsonBatch(transactionRoot: string): Promise<OwnedJsonBatchRecoveryResult> {
  const root = resolve(transactionRoot);
  const journal = join(root, ".savetoken-owned-batch.json");
  let raw: string;
  try {
    raw = await readFile(journal, "utf8");
  } catch {
    return { status: "MISSING", reason: "owned-batch-not-found" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "UNKNOWN", reason: "owned-batch-journal-invalid" };
  }
  if (typeof parsed !== "object" || parsed === null || (parsed as { version?: unknown }).version !== 1 || !Array.isArray((parsed as { writes?: unknown }).writes)) {
    return { status: "UNKNOWN", reason: "owned-batch-journal-invalid" };
  }
  let repaired = 0;
  for (const item of (parsed as { writes: unknown[] }).writes) {
    if (typeof item !== "object" || item === null) return { status: "UNKNOWN", reason: "owned-batch-journal-invalid" };
    const relativePath = (item as { relativePath?: unknown }).relativePath;
    const expectedHash = (item as { sha256?: unknown }).sha256;
    if (typeof relativePath !== "string" || typeof expectedHash !== "string" || relativePath.includes("..")) {
      return { status: "UNKNOWN", reason: "owned-batch-journal-invalid" };
    }
    const target = resolve(root, relativePath);
    if (target !== root && !target.startsWith(`${root}${process.platform === "win32" ? "\\" : "/"}`)) {
      return { status: "UNKNOWN", reason: "owned-batch-journal-invalid" };
    }
    try {
      await assertPathHasNoReparsePoints(target);
    } catch {
      return { status: "UNKNOWN", reason: "owned-batch-journal-invalid" };
    }
    const content = await readFile(target, "utf8").catch(() => undefined);
    if (content === undefined || hashContent(content) !== expectedHash) {
      return { status: "UNKNOWN", reason: "owned-batch-recovery-unverified" };
    }
    if (await isOwnedJson(target)) continue;
    await writeFile(`${target}.owner`, "savetoken\n", { encoding: "utf8", mode: 0o600 });
    await writeFile(`${target}.owner.sha256`, `${expectedHash}\n`, { encoding: "utf8", mode: 0o600 });
    repaired += 1;
  }
  await unlink(journal);
  return { status: "PRESENT", repaired };
}

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function isOwnedJson(path: string): Promise<boolean> {
  try {
    const content = await readFile(path, "utf8");
    const marker = await readFile(`${path}.owner`, "utf8");
    const recordedHash = await readFile(`${path}.owner.sha256`, "utf8");
    return marker === "savetoken\n" && hashContent(content) === recordedHash.trim();
  } catch {
    return false;
  }
}
