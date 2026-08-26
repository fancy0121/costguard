import { expect, test } from "bun:test";
import { DebugLog } from "../src/usage/debug";
import { createManagementHandler } from "../src/server/management";

const fixtureToken = ["fixture", "management", "token"].join("-");

test("debug log is bounded and stores event metadata without prompt content", () => {
  const log = new DebugLog(2);
  log.append({ event: "request.started", status: "PRESENT", detail: "fixture" });
  log.append({ event: "request.completed", status: "PRESENT", detail: "fixture" });
  log.append({ event: "request.failed", status: "UNKNOWN", detail: "redacted" });

  expect(log.entries()).toHaveLength(2);
  expect(log.entries()[0]).toMatchObject({ event: "request.completed", status: "PRESENT" });
  expect(JSON.stringify(log.entries())).not.toContain("prompt");
});

test("management exposes authenticated bounded debug logs", async () => {
  const log = new DebugLog();
  log.append({ event: "request.completed", status: "PRESENT" });
  const handler = createManagementHandler({
    managementToken: fixtureToken,
    health: () => ({ status: "healthy" }),
    ready: () => ({ status: "ready" }),
    catalog: () => ({ providers: [] }),
    logs: () => log.entries(),
    restore: async () => ({ status: "PRESENT" }),
    uninstall: async () => ({ status: "PRESENT" }),
  });

  const response = await handler(new Request("http://localhost/api/logs", {
    headers: { authorization: `Bearer ${fixtureToken}` },
  }));
  expect(response?.status).toBe(200);
  expect(await response?.json()).toMatchObject([{ event: "request.completed", status: "PRESENT" }]);
});
