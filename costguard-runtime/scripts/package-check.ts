import { fileURLToPath } from "node:url";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { packageManifest } from "../src/package/manifest";

const root = fileURLToPath(new URL("..", import.meta.url));
const paths: string[] = [];

async function walk(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else paths.push(relative(root, path).replace(/\\/g, "/"));
  }
}

await walk(root);
const manifest = packageManifest(paths);
const required = ["package.json", "bun.lock", "README.md", "LICENSE", "tsconfig.json"];
const missing = required.filter((path) => !paths.includes(path));
if (missing.length > 0) {
  console.error(JSON.stringify({ missing }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ allowed: manifest.allowed.length, excluded: manifest.excluded.length, missing }, null, 2));
