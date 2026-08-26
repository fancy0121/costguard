import { expect, test } from "bun:test";
import { clampEffort, resolveCombo, resolveSubagentModel } from "../src/codex/policy";

test("effort caps never raise a requested effort", () => {
  expect(clampEffort("high", "medium")).toEqual({ status: "PRESENT", effort: "medium" });
  expect(clampEffort("low", "high")).toEqual({ status: "PRESENT", effort: "low" });
  expect(clampEffort("not-an-effort", "high")).toEqual({ status: "UNKNOWN", reason: "effort-unrecognized" });
});

test("subagent fallback is explicit and high-risk work fails closed", () => {
  expect(resolveSubagentModel("missing/model", ["fixture/model-a"], "low")).toEqual({
    status: "PRESENT",
    model: "fixture/model-a",
    fallbackUsed: true,
  });
  expect(resolveSubagentModel("missing/model", ["fixture/model-a"], "high")).toEqual({
    status: "UNKNOWN",
    failClosed: true,
    reason: "high-risk-subagent-fallback-forbidden",
  });
  expect(resolveSubagentModel("fixture/model-a", ["fixture/model-a"], "high", { "fixture/model-a": "execution" })).toEqual({
    status: "UNKNOWN",
    failClosed: true,
    reason: "high-risk-subagent-fallback-forbidden",
  });
  expect(resolveSubagentModel("fixture/model-a", ["fixture/model-a"], "medium", { "fixture/model-a": "execution" })).toEqual({
    status: "UNKNOWN",
    failClosed: true,
    reason: "medium-risk-subagent-fallback-forbidden",
  });
  expect(resolveSubagentModel("fixture/model-a", ["fixture/model-a"], "medium")).toEqual({
    status: "UNKNOWN",
    failClosed: true,
    reason: "medium-risk-subagent-fallback-forbidden",
  });
});

test("combo resolution preserves configured order and reports missing routes", () => {
  expect(resolveCombo(["fixture/model-a", "fixture/model-b"], new Set(["fixture/model-a", "fixture/model-b"]), {
    tier: "execution",
    routeTiers: { "fixture/model-a": "execution", "fixture/model-b": "execution" },
  })).toEqual({
    status: "PRESENT",
    routes: ["fixture/model-a", "fixture/model-b"],
  });
  expect(resolveCombo(["fixture/model-a", "missing/model"], new Set(["fixture/model-a"]), { tier: "execution" })).toEqual({
    status: "UNKNOWN",
    failClosed: true,
    reason: "combo-route-unverified",
  });
  expect(resolveCombo(["fixture/model-a", "fixture/model-b"], new Set(["fixture/model-a", "fixture/model-b"]), { tier: "execution" })).toEqual({
    status: "UNKNOWN",
    failClosed: true,
    reason: "combo-tier-unverified",
  });
  expect(resolveCombo(["sol/model-a", "sol/model-b"], new Set(["sol/model-a", "sol/model-b"]), {
    tier: "sol",
  })).toEqual({
    status: "UNKNOWN",
    failClosed: true,
    reason: "high-risk-combo-fallback-forbidden",
  });
  expect(resolveCombo(["terra/model-a", "execution/model-b"], new Set(["terra/model-a", "execution/model-b"]), {
    tier: "terra",
    routeTiers: { "terra/model-a": "terra", "execution/model-b": "execution" },
  })).toEqual({ status: "UNKNOWN", failClosed: true, reason: "combo-tier-mismatch" });
  expect(resolveCombo(["execution/model-a", "glm/model-b"], new Set(["execution/model-a", "glm/model-b"]), {
    tier: "execution",
    routeTiers: { "execution/model-a": "execution", "glm/model-b": "glm-backup" },
  })).toEqual({ status: "UNKNOWN", failClosed: true, reason: "glm-backup-order-invalid" });
  expect(resolveCombo(["execution/model-a", "execution/model-b", "glm/model-b"], new Set(["execution/model-a", "execution/model-b", "glm/model-b"]), {
    tier: "execution",
    routeTiers: { "execution/model-a": "execution", "execution/model-b": "execution", "glm/model-b": "glm-backup" },
  })).toEqual({ status: "PRESENT", routes: ["execution/model-a", "execution/model-b", "glm/model-b"] });
  expect(resolveCombo(["glm/model-b", "execution/model-a"], new Set(["glm/model-b", "execution/model-a"]), {
    tier: "execution",
    routeTiers: { "execution/model-a": "execution", "glm/model-b": "glm-backup" },
  })).toEqual({ status: "UNKNOWN", failClosed: true, reason: "glm-backup-order-invalid" });
});
