import { expect, test } from "bun:test";
import { buildDashboardModel } from "../src/gui/dashboard";

test("dashboard view model reflects runtime state without inventing provider identity", () => {
  expect(buildDashboardModel({
    health: { status: "healthy" },
    ready: { status: "ready" },
    catalog: [{ id: "fixture/model-a", provider: "fixture" }],
  })).toEqual({
    health: { status: "healthy" },
    ready: { status: "ready" },
    catalog: [{ id: "fixture/model-a", provider: "fixture" }],
    actualRuntimeModel: "UNKNOWN",
  });
});
