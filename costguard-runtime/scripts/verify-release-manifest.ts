import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const runtimeRoot = fileURLToPath(new URL("..", import.meta.url));
const projectRoot = join(runtimeRoot, "..");
const outputRoot = join(projectRoot, "outputs");
const stageRoot = join(outputRoot, "costguard-v0.1.0-mvp");
const manifestPath = join(outputRoot, "costguard-v0.1.0-mvp-manifest.json");

const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex").toUpperCase();

async function files(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await files(p));
    else out.push(p);
  }
  return out;
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
  fileCount: number;
  totalBytes: number;
  files: Array<{ path: string; size: number; sha256: string }>;
};

const actual = new Map<string, { size: number; sha256: string }>();
let totalBytes = 0;
for (const p of await files(stageRoot)) {
  const rel = relative(stageRoot, p).replace(/\\/g, "/");
  const content = await readFile(p);
  const size = (await stat(p)).size;
  totalBytes += size;
  actual.set(rel, { size, sha256: digest(content) });
}

let mismatch = 0;
for (const e of manifest.files) {
  const a = actual.get(e.path);
  if (!a) {
    console.error(`MISSING_IN_ARCHIVE: ${e.path}`);
    mismatch += 1;
    continue;
  }
  if (a.size !== e.size || a.sha256 !== e.sha256) {
    console.error(`MISMATCH: ${e.path}`);
    mismatch += 1;
  }
}
const manifestPaths = new Set(manifest.files.map((e) => e.path));
for (const p of actual.keys()) {
  if (!manifestPaths.has(p)) {
    console.error(`EXTRA_NOT_IN_MANIFEST: ${p}`);
    mismatch += 1;
  }
}

const result = {
  manifestFileCount: manifest.fileCount,
  actualFileCount: actual.size,
  manifestTotalBytes: manifest.totalBytes,
  actualTotalBytes: totalBytes,
  mismatches: mismatch,
};
console.log(JSON.stringify(result, null, 2));
if (mismatch !== 0 || manifest.fileCount !== actual.size || manifest.totalBytes !== totalBytes) {
  process.exit(1);
}
