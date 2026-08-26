import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanPrivacy } from "../src/evidence/privacy";

test("privacy scan resolves Windows file URLs and finds no secret-like values", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const result = await scanPrivacy(root);
  expect(result).toEqual([]);
});

test("privacy scan catches common key, private-key, Slack, and JWT shapes", async () => {
  const root = await mkdtemp(join(tmpdir(), "costguard-privacy-"));
  const aws = ["AKIA", "0ABCDEFGHIJKLMNOP"].join("");
  const slack = ["xoxb", "fixture-token-value"].join("-");
  const jwt = ["eyJ", "payload-value-long", "signature-value-long"].join(".");
  const pemHeader = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
  await writeFile(join(root, "fixture.txt"), `${aws}\n${slack}\n${jwt}\n${pemHeader}\n`, "utf8");

  expect(await scanPrivacy(root)).toHaveLength(1);
});
