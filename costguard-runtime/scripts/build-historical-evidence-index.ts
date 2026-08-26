import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "..", "..");
const evidenceRoot = join(repositoryRoot, "docs", "superpowers", "evidence");
const output = resolve(process.argv[2] ?? join(evidenceRoot, "costguard-historical-savetoken-evidence-index-2026-08-26.json"));

const entries = [] as Array<{ path: string; bytes: number; sha256: string }>;
for (const name of (await readdir(evidenceRoot)).sort()) {
  const path = join(evidenceRoot, name);
  if (!/savetoken/i.test(name) || resolve(path) === output) continue;
  const content = await readFile(path);
  entries.push({
    path: relative(repositoryRoot, path).replace(/\\/g, "/"),
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
  });
}

await writeFile(output, `${JSON.stringify({
  schemaVersion: 1,
  activeName: "CostGuard",
  historicalName: "SaveToken",
  preservationRule: "Historical files remain byte-identical; this index is additive.",
  entries,
}, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ output: basename(output), entries: entries.length }));
