import { expect, test } from "bun:test";
import { runCalibration, type CalibrationCase } from "../src/calibration/sample";

const cases: CalibrationCase[] = [
  { id: "low-batch", signals: { text: "extract dates from these files", isBatchOrRepetitive: true }, expectedTier: "execution" },
  { id: "high-production", signals: { text: "生产环境权限迁移", isBatchOrRepetitive: true }, expectedTier: "sol" },
];

test("calibration compares acceptance outcomes without claiming speed or token savings", () => {
  expect(runCalibration(cases)).toEqual({ total: 2, accepted: 2, failed: 0, status: "PRESENT" });
});
