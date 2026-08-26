export type DebugLogEntry = {
  at: number;
  event: string;
  status: "PRESENT" | "UNKNOWN" | "NOT_TESTED";
  detail?: string;
};

export class DebugLog {
  private readonly limit: number;
  private readonly values: DebugLogEntry[] = [];

  constructor(limit = 100, initial: DebugLogEntry[] = []) {
    this.limit = Math.max(1, limit);
    this.values.push(...initial.slice(-this.limit).map((entry) => ({ ...entry })));
  }

  append(entry: Omit<DebugLogEntry, "at"> & { at?: number }): void {
    this.values.push({ ...entry, at: entry.at ?? Date.now() });
    while (this.values.length > this.limit) this.values.shift();
  }

  entries(): DebugLogEntry[] {
    return this.values.map((entry) => ({ ...entry }));
  }

  async persist(path: string): Promise<void> {
    await atomicWriteOwnedJson(path, { version: 1, entries: this.entries() });
  }

  static async load(path: string, limit = 100): Promise<DebugLog> {
    const raw = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? undefined : Promise.reject(error));
    if (raw === undefined) return new DebugLog(limit);
    if (!(await isOwnedJson(path))) throw new Error("debug-log-unverified");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new Error("debug-log-invalid"); }
    const entries = typeof parsed === "object" && parsed !== null && (parsed as { version?: unknown }).version === 1 && Array.isArray((parsed as { entries?: unknown }).entries)
      ? (parsed as { entries: unknown[] }).entries
      : undefined;
    if (!entries || entries.some((entry) => !validDebugEntry(entry))) throw new Error("debug-log-invalid");
    return new DebugLog(limit, entries as DebugLogEntry[]);
  }
}

function validDebugEntry(value: unknown): value is DebugLogEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<DebugLogEntry>;
  return Number.isFinite(entry.at) && typeof entry.event === "string" && /^[a-z][a-z0-9._-]*$/.test(entry.event)
    && (entry.status === "PRESENT" || entry.status === "UNKNOWN" || entry.status === "NOT_TESTED")
    && (entry.detail === undefined || typeof entry.detail === "string");
}
import { readFile } from "node:fs/promises";
import { atomicWriteOwnedJson, isOwnedJson } from "../config/homes";
