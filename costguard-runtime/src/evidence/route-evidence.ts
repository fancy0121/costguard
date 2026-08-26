import type { CostGuardRouteDecision } from "../types";

export type RouteEvidence = {
  chosenTier: CostGuardRouteDecision["tier"];
  candidates: string[];
  escalationReasons: string[];
  failClosed: boolean;
  actualRuntimeModel: "UNKNOWN" | string;
  evidenceValid: boolean;
};

export function buildRouteEvidence(decision: CostGuardRouteDecision): RouteEvidence {
  return {
    chosenTier: decision.tier,
    candidates: [...decision.candidates],
    escalationReasons: [...decision.escalationReasons],
    failClosed: decision.failClosed,
    actualRuntimeModel: "UNKNOWN",
    evidenceValid: false,
  };
}
