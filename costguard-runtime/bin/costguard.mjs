#!/usr/bin/env bun
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../src/cli/main.ts", import.meta.url));
const child = Bun.spawn({
  cmd: [process.execPath, entrypoint, ...process.argv.slice(2)],
  env: process.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(await child.exited);
