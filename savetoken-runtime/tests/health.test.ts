import { expect, test } from "bun:test";
import { HealthState } from "../src/server/health";

test("health and readiness remain distinct", () => {
  const state = new HealthState();

  expect(state.health()).toEqual({ status: "healthy" });
  expect(state.ready()).toEqual({ status: "pending" });

  state.markReady();
  expect(state.ready()).toEqual({ status: "ready" });

  state.markFailed("catalog-sync-failed");
  expect(state.health()).toEqual({ status: "unhealthy", reason: "catalog-sync-failed" });
  expect(state.ready()).toEqual({ status: "failed", reason: "catalog-sync-failed" });
});
