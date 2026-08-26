import { expect, test } from "bun:test";
import { createManagementHandler } from "../src/server/management";

const fixtureToken = ["fixture", "management", "token"].join("-");

test("management plane requires its own explicit bearer credential", async () => {
  const handler = createManagementHandler({
    managementToken: fixtureToken,
    health: () => ({ status: "healthy" }),
    ready: () => ({ status: "ready" }),
    catalog: () => ({ providers: [] }),
    restore: async () => ({ status: "PRESENT" }),
    uninstall: async () => ({ status: "PRESENT" }),
  });

  const unauthorized = await handler(new Request("http://localhost/api/status"));
  expect(unauthorized?.status).toBe(401);

  const authorized = await handler(new Request("http://localhost/api/status", {
    headers: { authorization: `Bearer ${fixtureToken}` },
  }));
  expect(authorized?.status).toBe(200);
  expect(await authorized?.json()).toEqual({ health: { status: "healthy" }, ready: { status: "ready" } });
});

test("management routes expose catalog and owned lifecycle operations", async () => {
  const calls: string[] = [];
  const handler = createManagementHandler({
    managementToken: fixtureToken,
    health: () => ({ status: "healthy" }),
    ready: () => ({ status: "ready" }),
    catalog: () => ({ providers: [{ id: "fixture" }] }),
    usage: () => ({ requests: 1, measuredTokenRequests: 0, unreportedRequests: 1 }),
    restore: async () => { calls.push("restore"); return { status: "PRESENT" }; },
    uninstall: async () => { calls.push("uninstall"); return { status: "PRESENT" }; },
  });
  const headers = { authorization: `Bearer ${fixtureToken}` };

  expect((await handler(new Request("http://localhost/api/catalog", { headers })))?.status).toBe(200);
  expect(await (await handler(new Request("http://localhost/api/usage", { headers })))?.json()).toEqual({
    requests: 1,
    measuredTokenRequests: 0,
    unreportedRequests: 1,
  });
  expect((await handler(new Request("http://localhost/api/restore", { method: "POST", headers })))?.status).toBe(200);
  expect((await handler(new Request("http://localhost/api/uninstall", { method: "POST", headers })))?.status).toBe(200);
  expect(calls).toEqual(["restore", "uninstall"]);
});

test("management lifecycle does not turn UNKNOWN or MISSING into HTTP success", async () => {
  const handler = createManagementHandler({
    managementToken: fixtureToken,
    health: () => ({ status: "healthy" }),
    ready: () => ({ status: "ready" }),
    catalog: () => ({ providers: [] }),
    restore: async () => ({ status: "UNKNOWN", reason: "owned-state-unverified" }),
    uninstall: async () => ({ status: "MISSING", reason: "no-owned-state" }),
  });
  const headers = { authorization: `Bearer ${fixtureToken}` };

  expect((await handler(new Request("http://localhost/api/restore", { method: "POST", headers })))?.status).toBe(503);
  expect((await handler(new Request("http://localhost/api/uninstall", { method: "POST", headers })))?.status).toBe(404);
});
