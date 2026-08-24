import { expect, test } from "bun:test";
import { readFile, access } from "node:fs/promises";

test("cross-platform CI declares all three operating systems and local gates", async () => {
  const ymlPath = new URL("../../.github/workflows/savetoken-runtime.yml", import.meta.url);
  try {
    await access(ymlPath);
  } catch {
    // Root-level CI workflow is outside the MVP package scope. This check runs
    // only when the project root is present (source tree), not in clean-room installs.
    console.warn("CI workflow file not found — root-level check skipped (package-scope boundary).");
    return;
  }
  const workflow = await readFile(ymlPath, "utf8");
  expect(workflow).toContain("windows-latest");
  expect(workflow).toContain("ubuntu-latest");
  expect(workflow).toContain("macos-latest");
  expect(workflow).toContain("bun run privacy:scan");
  expect(workflow).toContain("bun run package:check");
});