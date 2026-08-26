import { expect, test } from "bun:test";
import { selectProviderKey, type ProviderKeyReference } from "../src/providers/key-pool";

const key = (overrides: Partial<ProviderKeyReference>): ProviderKeyReference => ({
  id: "key-a",
  provider: "fixture",
  envVar: "FIXTURE_API_KEY_REF",
  health: "healthy",
  cooldownUntil: undefined,
  ...overrides,
});

test("key pool selects an eligible opaque environment reference", () => {
  expect(selectProviderKey([key({ id: "cooling", cooldownUntil: 2000 }), key({ id: "ready" })], {
    provider: "fixture",
    now: 1000,
  })).toEqual({ status: "PRESENT", keyId: "ready" });
});

test("key pool fails closed for invalid, unhealthy, or cross-provider references", () => {
  expect(selectProviderKey([
    key({ id: "invalid", envVar: "plain-value" }),
    key({ id: "unhealthy", health: "unavailable" }),
    key({ id: "other", provider: "other" }),
  ], { provider: "fixture", now: 1000 })).toEqual({
    status: "UNKNOWN",
    failClosed: true,
    reason: "no-eligible-provider-key",
  });
});
