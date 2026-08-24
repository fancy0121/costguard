import { decideRoute } from "../routing/route";
import type { SaveTokenRouteDecision, SaveTokenTaskSignals, SaveTokenTier } from "../types";

export type CalibrationCase = {
  id: string;
  signals: SaveTokenTaskSignals;
  expectedTier: SaveTokenTier;
};

export type CalibrationSummary = {
  total: number;
  accepted: number;
  failed: number;
  status: "PRESENT" | "UNKNOWN";
};

export function runCalibration(cases: CalibrationCase[], route: (signals: SaveTokenTaskSignals) => SaveTokenRouteDecision = decideRoute): CalibrationSummary {
  let accepted = 0;
  for (const sample of cases) {
    if (route(sample.signals).tier === sample.expectedTier) accepted += 1;
  }
  const failed = cases.length - accepted;
  return { total: cases.length, accepted, failed, status: failed === 0 ? "PRESENT" : "UNKNOWN" };
}
