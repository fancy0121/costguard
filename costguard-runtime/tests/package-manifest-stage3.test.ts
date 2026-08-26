import { expect, test } from "bun:test";
import { packagePathAllowed, packageManifest } from "../src/package/manifest";

test("package allowlist excludes dependencies, credentials, and runtime state", () => {
  expect(packagePathAllowed("package.json")).toBe(true);
  expect(packagePathAllowed("src/server/runtime.ts")).toBe(true);
  expect(packagePathAllowed("node_modules/bun/index.js")).toBe(false);
  expect(packagePathAllowed(".env")).toBe(false);
  expect(packagePathAllowed("runtime.json")).toBe(false);
});

test("reproducibility package admits the repository test suite for clean-room verification", () => {
  expect(packagePathAllowed("tests/protocol-stream-cancel-conformance.test.ts")).toBe(true);
});

test("package manifest reports allowed and excluded paths without reading file contents", () => {
  expect(packageManifest(["package.json", "src/index.ts", "node_modules/bun/index.js"])).toEqual({
    allowed: ["package.json", "src/index.ts"],
    excluded: ["node_modules/bun/index.js"],
  });
});
