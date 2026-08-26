import { decideRoute } from "../routing/route";
import type { CostGuardRouteDecision, CostGuardTaskSignals, CostGuardTier } from "../types";

export type CalibrationCase = {
  id: string;
  signals: CostGuardTaskSignals;
  expectedTier: CostGuardTier;
};

export type CalibrationSummary = {
  total: number;
  accepted: number;
  failed: number;
  status: "PRESENT" | "UNKNOWN";
};

export function runCalibration(cases: CalibrationCase[], route: (signals: CostGuardTaskSignals) => CostGuardRouteDecision = decideRoute): CalibrationSummary {
  let accepted = 0;
  for (const sample of cases) {
    if (route(sample.signals).tier === sample.expectedTier) accepted += 1;
  }
  const failed = cases.length - accepted;
  return { total: cases.length, accepted, failed, status: failed === 0 ? "PRESENT" : "UNKNOWN" };
}
