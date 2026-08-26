import { expect, test } from "bun:test";
import { buildRouteEvidence } from "../src/evidence/route-evidence";

test("route evidence keeps actual model UNKNOWN until runtime readback exists", () => {
  const evidence = buildRouteEvidence({
    tier: "execution",
    candidates: ["gpt-5.6-luna", "deepseek-v4-flash"],
    escalationReasons: [],
    failClosed: false,
  });

  expect(evidence.chosenTier).toBe("execution");
  expect(evidence.actualRuntimeModel).toBe("UNKNOWN");
  expect(evidence.evidenceValid).toBe(false);
});
