import { expect, test } from "bun:test";
import { SidecarFacade } from "../src/sidecars/capabilities";

test("vision facade rejects unknown capability configuration without invoking its local adapter", async () => {
  let calls = 0;
  const facade = new SidecarFacade({
    authorized: true,
    capabilities: new Set(["not-vision" as never]),
    invoke: async () => { calls += 1; return { source: "fixture" }; },
  });
  expect(facade.connect("not-vision" as never)).toEqual({ status: "UNKNOWN", failClosed: true, reason: "sidecar-unavailable" });
  expect(calls).toBe(0);
});

test("vision facade cancellation closes the local session without claiming a real vision call", async () => {
  const facade = new SidecarFacade({
    authorized: true,
    capabilities: new Set(["vision"]),
    invoke: async (_kind, _message, signal) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { aborted: signal.aborted };
    },
  });
  const connection = facade.connect("vision");
  if (connection.status !== "PRESENT") throw new Error("unreachable");
  const pending = connection.session.send({ fixture: "vision" });
  expect(connection.session.cancel()).toEqual({ status: "PRESENT", state: "cancelled" });
  await expect(pending).resolves.toEqual({ status: "UNKNOWN", failClosed: true, reason: "sidecar-session-cancelled" });
});
