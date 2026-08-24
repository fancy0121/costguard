const ALLOWED_EXACT = new Set(["package.json", "bun.lock", "README.md", "LICENSE", "tsconfig.json"]);

function normalize(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function packagePathAllowed(relativePath: string): boolean {
  const path = normalize(relativePath);
  if (path.startsWith("node_modules/") || path.startsWith(".git/") || path.startsWith(".savetoken/")) return false;
  if (path === ".env" || path.endsWith("/.env") || path.endsWith(".owner") || path.endsWith(".tmp")) return false;
  if (/^(runtime|catalogs|logs|outputs)(\/|\.|$)/.test(path)) return false;
  return ALLOWED_EXACT.has(path) || path.startsWith("src/") || path.startsWith("scripts/") || path.startsWith("tests/");
}

export function packageManifest(paths: string[]): { allowed: string[]; excluded: string[] } {
  const allowed: string[] = [];
  const excluded: string[] = [];
  for (const path of paths) {
    (packagePathAllowed(path) ? allowed : excluded).push(normalize(path));
  }
  return { allowed, excluded };
}
