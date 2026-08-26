import { fileURLToPath } from "node:url";
import { scanPrivacy } from "../src/evidence/privacy";

const root = fileURLToPath(new URL("..", import.meta.url));
const hits = await scanPrivacy(root);
for (const path of hits) {
  console.error(`secret-like pattern in ${path}`);
}

if (hits.length > 0) process.exit(1);
console.log(`privacy scan clean: ${hits.length} hits`);
