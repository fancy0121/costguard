import type { SaveTokenRouteDecision } from "../types";

export type RouteEvidence = {
  chosenTier: SaveTokenRouteDecision["tier"];
  candidates: string[];
  escalationReasons: string[];
  failClosed: boolean;
  actualRuntimeModel: "UNKNOWN" | string;
  evidenceValid: boolean;
};

export function buildRouteEvidence(decision: SaveTokenRouteDecision): RouteEvidence {
  return {
    chosenTier: decision.tier,
    candidates: [...decision.candidates],
    escalationReasons: [...decision.escalationReasons],
    failClosed: decision.failClosed,
    actualRuntimeModel: "UNKNOWN",
    evidenceValid: false,
  };
}
