import { expect, test } from "bun:test";
import { formatOwnedConfigMarker, restoreOwnedConfig } from "../src/config/restore";

test("restore removes only SaveToken-owned lines and preserves user edits", () => {
  const owned = "model_provider = \"savetoken\"";
  const input = [owned, formatOwnedConfigMarker("model_provider", owned), "model = \"user-model\"", ""].join("\n");

  expect(restoreOwnedConfig(input)).toBe("model = \"user-model\"\n");
});

test("restore never removes an unmarked user assignment", () => {
  const input = [
    "model = \"user-model\"",
    "# savetoken-owned: model_provider",
    "",
  ].join("\n");

  expect(restoreOwnedConfig(input)).toBe("model = \"user-model\"\n");
});

test("restore removes a hashed owned assignment but preserves a later user edit", () => {
  const original = "model_provider = \"savetoken\"";
  const marker = formatOwnedConfigMarker("model_provider", original);
  expect(restoreOwnedConfig([original, marker, ""].join("\n"))).toBe("");

  const edited = "model_provider = \"user-provider\"";
  expect(restoreOwnedConfig([edited, marker, ""].join("\n"))).toBe(`${edited}\n`);
});
