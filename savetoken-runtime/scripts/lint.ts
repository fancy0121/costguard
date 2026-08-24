import { fileURLToPath } from "node:url";
import { scanPrivacy } from "../src/evidence/privacy";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const forbidden = /\bTODO\b|\bTBD\b|\[PLACEHOLDER\]/;
const failures: string[] = [];

async function walk(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(ts|json|md)$/.test(entry.name)) {
      const text = await readFile(path, "utf8");
      if (forbidden.test(text)) failures.push(`${path}: forbidden placeholder`);
    }
  }
}

await walk(root);
const privacyHits = await scanPrivacy(root);
for (const path of privacyHits) failures.push(`${path}: secret-like value`);
if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log("lint clean");
