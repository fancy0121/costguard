import { expect, test } from "bun:test";
import { selectProviderAccount, type ProviderAccountState } from "../src/providers/availability";

const account = (overrides: Partial<ProviderAccountState>): ProviderAccountState => ({
  id: "opaque-a",
  provider: "fixture",
  health: "healthy",
  quota: { status: "measured", remaining: 10 },
  cooldownUntil: undefined,
  affinityKey: undefined,
  ...overrides,
});

test("availability keeps affinity when the bound account remains eligible", () => {
  const result = selectProviderAccount([
    account({ id: "opaque-a", affinityKey: "thread-1" }),
    account({ id: "opaque-b" }),
  ], { provider: "fixture", affinityKey: "thread-1", now: 1000 });

  expect(result).toEqual({ status: "PRESENT", accountId: "opaque-a", reason: "affinity" });
});

test("availability excludes unknown quota, cooldown, and unhealthy accounts", () => {
  const result = selectProviderAccount([
    account({ id: "unknown-quota", quota: { status: "unknown" } }),
    account({ id: "cooling", cooldownUntil: 2000 }),
    account({ id: "unhealthy", health: "unavailable" }),
  ], { provider: "fixture", now: 1000 });

  expect(result).toEqual({ status: "UNKNOWN", failClosed: true, reason: "no-eligible-provider-account" });
});

test("availability never selects an account from another provider", () => {
  expect(selectProviderAccount([account({ provider: "other" })], { provider: "fixture", now: 1000 })).toEqual({
    status: "UNKNOWN",
    failClosed: true,
    reason: "no-eligible-provider-account",
  });
});

test("availability fails closed on non-finite quota observations", () => {
  expect(selectProviderAccount([account({ quota: { status: "measured", remaining: Number.NaN } })], {
    provider: "fixture",
    now: 1000,
  })).toEqual({ status: "UNKNOWN", failClosed: true, reason: "no-eligible-provider-account" });
});

test("availability honors priority only after health, quota, cooldown, and affinity eligibility", () => {
  expect(selectProviderAccount([
    account({ id: "high-quota", priority: 0, quota: { status: "measured", remaining: 100 } }),
    account({ id: "preferred", priority: 10, quota: { status: "measured", remaining: 1 } }),
  ], { provider: "fixture", now: 1000 })).toEqual({
    status: "PRESENT",
    accountId: "preferred",
    reason: "quota",
  });
});
