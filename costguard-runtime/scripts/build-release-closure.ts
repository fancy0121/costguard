import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { packagePathAllowed } from "../src/package/manifest";

const runtimeRoot = fileURLToPath(new URL("..", import.meta.url));
const projectRoot = join(runtimeRoot, "..");
const outputRoot = join(projectRoot, "outputs");
const stageRoot = join(outputRoot, "costguard-v0.1.0-mvp");
const manifestPath = join(outputRoot, "costguard-v0.1.0-mvp-manifest.json");
const archivePath = join(outputRoot, "costguard-v0.1.0-mvp.zip");
const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex").toUpperCase();
async function files(dir: string): Promise<string[]> { const out: string[] = []; for (const e of await readdir(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) out.push(...await files(p)); else out.push(p); } return out; }
await rm(stageRoot, { recursive: true, force: true }); await mkdir(stageRoot, { recursive: true });
for (const source of (await files(runtimeRoot)).filter((p) => packagePathAllowed(relative(runtimeRoot, p)))) { const target = join(stageRoot, relative(runtimeRoot, source)); await mkdir(join(target, ".."), { recursive: true }); await cp(source, target, { force: true }); }
const entries = await Promise.all((await files(stageRoot)).map(async (p) => { const content = await readFile(p); return { path: relative(stageRoot, p).replace(/\\/g, "/"), size: (await stat(p)).size, sha256: digest(content) }; }));
entries.sort((a, b) => a.path.localeCompare(b.path));
const manifest = { package: "costguard", version: "0.1.0", generatedAt: new Date().toISOString(), fileCount: entries.length, totalBytes: entries.reduce((n, e) => n + e.size, 0), files: entries };
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8"); await rm(archivePath, { force: true });
const proc = Bun.spawn({ cmd: ["powershell", "-NoProfile", "-Command", `Compress-Archive -Path '${stageRoot}\\*' -DestinationPath '${archivePath}' -Force`] }); if ((await proc.exited) !== 0) throw new Error("archive-build-failed");
console.log(JSON.stringify({ archiveSha256: digest(await readFile(archivePath)), manifestSha256: digest(await readFile(manifestPath)), fileCount: entries.length, totalBytes: manifest.totalBytes }));
