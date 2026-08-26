import { expect, test } from "bun:test";
import { createServicePlan } from "../src/service/lifecycle";

test("service and shim plan rejects unrecognized runtime platform and lifecycle action", () => {
  expect(createServicePlan("unknown" as never, "install", "C:/isolated/runtime")).toEqual({
    status: "UNKNOWN", failClosed: true, reason: "service-platform-or-action-invalid",
  });
  expect(createServicePlan("windows", "elevate" as never, "C:/isolated/runtime")).toEqual({
    status: "UNKNOWN", failClosed: true, reason: "service-platform-or-action-invalid",
  });
});

test("service and shim plan stays an explicitly non-executed reversible contract", () => {
  const plan = createServicePlan("windows", "rollback", "C:/isolated/runtime");
  expect(plan).toMatchObject({ status: "NOT_TESTED", platform: "windows", action: "rollback", executed: false });
  if (plan.status !== "NOT_TESTED") throw new Error("unreachable");
  expect(plan.commands).toEqual(["schtasks:rollback:costguard:C:/isolated/runtime", "shim:rollback:costguard:C:/isolated/runtime"]);
});
