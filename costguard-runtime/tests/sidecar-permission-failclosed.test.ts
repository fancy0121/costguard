import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SidecarFacade } from "../src/sidecars/capabilities";
import { startRuntime } from "../src/server/runtime";

test("sidecar facade rejects CostGuard control fields before an allowlisted adapter can observe them", async () => {
  const received: unknown[] = [];
  const facade = new SidecarFacade({
    authorized: true,
    capabilities: new Set(["web-search"]),
    invoke: async (_kind, message) => { received.push(message); return { source: "fixture" }; },
  });
  const connection = facade.connect("web-search");
  if (connection.status !== "PRESENT") throw new Error("unreachable");

  await expect(connection.session.send({ query: "bounded fixture", costguardInternal: true })).resolves.toEqual({
    status: "UNKNOWN", failClosed: true, reason: "sidecar-message-internal-field",
  });
  expect(received).toEqual([]);
});

test("runtime WebSocket rejects sidecar control fields and never invokes the configured facade", async () => {
  const root = await mkdtemp(join(tmpdir(), "costguard-sidecar-control-"));
  const token = ["fixture", "sidecar", "token"].join("-");
  let calls = 0;
  const runtime = await startRuntime({
    env: { CODEX_HOME: join(root, "codex"), COSTGUARD_HOME: join(root, "state") },
    providers: {}, managementToken: token,
    sidecarFacade: new SidecarFacade({
      authorized: true, capabilities: new Set(["web-search"]),
      invoke: async () => { calls += 1; return { source: "fixture" }; },
    }),
  });
  try {
    const result = await new Promise<unknown>((resolve, reject) => {
      const socket = new WebSocket(`${runtime.baseUrl.replace(/^http/, "ws")}/v1/sidecars/web-search`, ["costguard-sidecar", token]);
      socket.addEventListener("open", () => socket.send(JSON.stringify({ query: "bounded fixture", costguardControl: "local" })), { once: true });
      socket.addEventListener("message", (event) => { resolve(JSON.parse(String(event.data))); socket.close(); }, { once: true });
      socket.addEventListener("error", () => reject(new Error("sidecar-websocket-error")), { once: true });
    });
    expect(result).toEqual({ status: "UNKNOWN", failClosed: true, reason: "sidecar-message-internal-field" });
    expect(calls).toBe(0);
  } finally {
    runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});
