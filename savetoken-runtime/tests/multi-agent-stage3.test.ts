import { expect, test } from "bun:test";
import { resolveMultiAgentSurface } from "../src/codex/multi-agent";

test("multi-agent surface requires an explicit supported mode and visible models", () => {
  expect(resolveMultiAgentSurface("v2", ["fixture/model-a"], new Set(["fixture/model-a"]))).toEqual({
    status: "PRESENT",
    mode: "v2",
    subagentModels: ["fixture/model-a"],
  });
  expect(resolveMultiAgentSurface("v1", ["missing/model"], new Set(["fixture/model-a"]))).toEqual({
    status: "UNKNOWN",
    failClosed: true,
    reason: "subagent-model-unverified",
  });
});

test("multi-agent surface fails closed on an unrecognized mode", () => {
  expect(resolveMultiAgentSurface("legacy" as "v1", ["fixture/model-a"], new Set(["fixture/model-a"]))).toEqual({
    status: "UNKNOWN",
    failClosed: true,
    reason: "multi-agent-mode-unverified",
  });
});
