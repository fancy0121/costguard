import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SidecarFacade } from "../src/sidecars/capabilities";
import { startRuntime } from "../src/server/runtime";

async function receive(socket: WebSocket): Promise<{ data?: unknown; close?: number }> {
  return new Promise((resolve) => {
    socket.addEventListener("message", (event) => resolve({ data: JSON.parse(String(event.data)) }), { once: true });
    socket.addEventListener("close", (event) => resolve({ close: event.code }), { once: true });
  });
}

test("runtime WebSocket bridge requires authorization, invokes only an allowlisted local facade, and cancels on close", async () => {
  const root = await mkdtemp(join(tmpdir(), "costguard-ws-"));
  const calls: unknown[] = [];
  let aborted = false;
  const token = "isolated-sidecar-token";
  const facade = new SidecarFacade({
    authorized: true,
    capabilities: new Set(["web-search"]),
    invoke: async (kind, message, signal) => {
      calls.push({ kind, message });
      signal.addEventListener("abort", () => { aborted = true; });
      return { source: "fixture", value: "ok" };
    },
  });
  const runtime = await startRuntime({
    env: { CODEX_HOME: join(root, "codex"), COSTGUARD_HOME: join(root, "state") }, providers: {}, providerTier: "execution", managementToken: token, sidecarFacade: facade,
  });
  try {
    const unauthenticated = await fetch(`${runtime.baseUrl}/v1/sidecars/web-search`, { headers: { connection: "Upgrade", upgrade: "websocket" } });
    expect(unauthenticated.status).toBe(401);

    const unavailable = await fetch(`${runtime.baseUrl}/v1/sidecars/vision`, { headers: { authorization: `Bearer ${token}` } });
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ status: "UNKNOWN", failClosed: true, reason: "sidecar-unavailable" });

    const socket = new WebSocket(runtime.baseUrl.replace("http", "ws") + "/v1/sidecars/web-search", ["costguard-sidecar", token]);
    await new Promise<void>((resolve) => socket.addEventListener("open", () => resolve(), { once: true }));
    socket.send(JSON.stringify({ query: "isolated fixture" }));
    expect(await receive(socket)).toEqual({ data: { status: "PRESENT", result: { source: "fixture", value: "ok" } } });
    expect(calls).toEqual([{ kind: "web-search", message: { query: "isolated fixture" } }]);
    socket.close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(aborted).toBe(true);
  } finally {
    runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});
