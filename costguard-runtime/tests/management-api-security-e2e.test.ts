import { expect, test } from "bun:test";
import { createManagementHandler } from "../src/server/management";

const token = ["fixture", "management", "token"].join("-");

function handler(overrides: Partial<Parameters<typeof createManagementHandler>[0]> = {}) {
  return createManagementHandler({
    managementToken: token,
    health: () => ({ status: "healthy" }),
    ready: () => ({ status: "ready" }),
    catalog: () => ({ data: [] }),
    restore: async () => ({ status: "PRESENT" }),
    uninstall: async () => ({ status: "PRESENT" }),
    ...overrides,
  });
}

test("management discovery callback failure returns a redacted fail-closed response", async () => {
  const response = await handler({ modelDiscovery: async () => { throw new Error("private local path and token"); } })(new Request("http://127.0.0.1/api/model-discovery", { headers: { authorization: `Bearer ${token}` } }));
  expect(response?.status).toBe(503);
  const body = await response?.json();
  expect(body).toEqual({ status: "UNKNOWN", failClosed: true, reason: "management-operation-failed" });
  expect(JSON.stringify(body)).not.toContain("private");
});

test("management lifecycle callback failure returns the same stable fail-closed response", async () => {
  const response = await handler({ restore: async () => { throw new Error("private lifecycle detail"); } })(new Request("http://127.0.0.1/api/restore", { method: "POST", headers: { authorization: `Bearer ${token}` } }));
  expect(response?.status).toBe(503);
  expect(await response?.json()).toEqual({ status: "UNKNOWN", failClosed: true, reason: "management-operation-failed" });
});
