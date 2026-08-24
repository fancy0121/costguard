import { expect, test } from "bun:test";
import { SidecarFacade, selectSidecar } from "../src/sidecars/capabilities";

test("web-search facade refuses an unknown runtime capability even when an untyped set claims it is configured", async () => {
  const result = selectSidecar("unrecognized" as never, true, new Set(["unrecognized" as never]));
  expect(result).toEqual({ status: "UNKNOWN", failClosed: true, reason: "sidecar-unavailable" });

  const facade = new SidecarFacade({
    authorized: true,
    capabilities: new Set(["unrecognized" as never]),
    invoke: async () => ({ source: "fixture" }),
  });
  expect(facade.connect("unrecognized" as never)).toEqual({ status: "UNKNOWN", failClosed: true, reason: "sidecar-unavailable" });
});

test("web-search facade has a bounded local success path without asserting external search availability", async () => {
  const facade = new SidecarFacade({
    authorized: true,
    capabilities: new Set(["web-search"]),
    invoke: async (kind, message) => ({ kind, query: (message as { query: string }).query, source: "local-fixture" }),
  });
  const connection = facade.connect("web-search");
  if (connection.status !== "PRESENT") throw new Error("unreachable");
  await expect(connection.session.send({ query: "bounded fixture" })).resolves.toEqual({
    status: "PRESENT", result: { kind: "web-search", query: "bounded fixture", source: "local-fixture" },
  });
});
