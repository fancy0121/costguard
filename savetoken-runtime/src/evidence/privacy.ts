import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const secretPattern = /(sk-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN(?: RSA| EC| OPENSSH)? PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/i;

async function files(dir: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else result.push(path);
  }
  return result;
}

export async function scanPrivacy(root: string): Promise<string[]> {
  const hits: string[] = [];
  for (const path of await files(root)) {
    const content = await readFile(path, "utf8");
    if (secretPattern.test(content)) hits.push(path);
  }
  return hits;
}
