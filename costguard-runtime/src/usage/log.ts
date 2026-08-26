export type UsageEntry = {
  at: number;
  provider: string;
  model: string;
  outcome: "PRESENT" | "UNKNOWN" | "NOT_TESTED";
  promptTokens?: number;
  completionTokens?: number;
};

export class UsageLog {
  private readonly limit: number;
  private readonly values: UsageEntry[] = [];

  constructor(limit = 100, initial: UsageEntry[] = []) {
    this.limit = Math.max(1, limit);
    this.values.push(...initial.slice(-this.limit).map((entry) => ({ ...entry })));
  }

  append(entry: Omit<UsageEntry, "at"> & { at?: number }): void {
    this.values.push({ ...entry, at: entry.at ?? Date.now() });
    while (this.values.length > this.limit) this.values.shift();
  }

  entries(): UsageEntry[] {
    return this.values.map((entry) => ({ ...entry }));
  }

  summary(): { requests: number; measuredTokenRequests: number; unreportedRequests: number } {
    const measured = this.values.filter((entry) => entry.promptTokens !== undefined && entry.completionTokens !== undefined).length;
    return {
      requests: this.values.length,
      measuredTokenRequests: measured,
      unreportedRequests: this.values.length - measured,
    };
  }

  async persist(path: string): Promise<void> {
    await atomicWriteOwnedJson(path, { version: 1, entries: this.entries() });
  }

  static async load(path: string, limit = 100): Promise<UsageLog> {
    const raw = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? undefined : Promise.reject(error));
    if (raw === undefined) return new UsageLog(limit);
    if (!(await isOwnedJson(path))) throw new Error("usage-log-unverified");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new Error("usage-log-invalid"); }
    const entries = typeof parsed === "object" && parsed !== null && (parsed as { version?: unknown }).version === 1 && Array.isArray((parsed as { entries?: unknown }).entries)
      ? (parsed as { entries: unknown[] }).entries
      : undefined;
    if (!entries || entries.some((entry) => !validUsageEntry(entry))) throw new Error("usage-log-invalid");
    return new UsageLog(limit, entries as UsageEntry[]);
  }
}

function validUsageEntry(value: unknown): value is UsageEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<UsageEntry>;
  return Number.isFinite(entry.at) && typeof entry.provider === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry.provider)
    && typeof entry.model === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(entry.model)
    && (entry.outcome === "PRESENT" || entry.outcome === "UNKNOWN" || entry.outcome === "NOT_TESTED")
    && (entry.promptTokens === undefined || Number.isFinite(entry.promptTokens))
    && (entry.completionTokens === undefined || Number.isFinite(entry.completionTokens));
}
import { readFile } from "node:fs/promises";
import { atomicWriteOwnedJson, isOwnedJson } from "../config/homes";
