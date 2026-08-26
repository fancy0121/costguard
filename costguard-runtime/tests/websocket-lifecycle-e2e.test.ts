import { expect, test } from "bun:test";
import { SidecarFacade } from "../src/sidecars/capabilities";
import { startRuntime } from "../src/server/runtime";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("configured sidecar facade admits an authorized lifecycle, forwards an allowlisted fixture message, and closes deterministically", async () => {
  const observed: unknown[] = [];
  const facade = new SidecarFacade({
    capabilities: new Set(["web-search"]),
    authorized: true,
    invoke: async (kind, message, signal) => {
      observed.push({ kind, message, aborted: signal.aborted });
      return { source: "local-fixture", text: "fixture-result" };
    },
  });
  const session = facade.connect("web-search");
  expect(session).toMatchObject({ status: "PRESENT" });
  if (session.status !== "PRESENT") throw new Error("unreachable");
  expect(await session.session.send({ query: "isolated fixture only" })).toEqual({ status: "PRESENT", result: { source: "local-fixture", text: "fixture-result" } });
  expect(observed).toEqual([{ kind: "web-search", message: { query: "isolated fixture only" }, aborted: false }]);
  expect(session.session.close()).toEqual({ status: "PRESENT", state: "closed" });
  expect(await session.session.send({ query: "after close" })).toEqual({ status: "UNKNOWN", failClosed: true, reason: "sidecar-session-closed" });
});

test("sidecar facade fails closed for unauthorized, unavailable, and cancel-before-complete lifecycles", async () => {
  const unauthorized = new SidecarFacade({ capabilities: new Set(["vision"]), authorized: false, invoke: async () => ({}) });
  expect(unauthorized.connect("vision")).toEqual({ status: "UNKNOWN", failClosed: true, reason: "sidecar-authorization-required" });

  const unavailable = new SidecarFacade({ capabilities: new Set(), authorized: true, invoke: async () => ({}) });
  expect(unavailable.connect("vision")).toEqual({ status: "UNKNOWN", failClosed: true, reason: "sidecar-unavailable" });

  const cancellable = new SidecarFacade({
    capabilities: new Set(["vision"]), authorized: true,
    invoke: async (_kind, _message, signal) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return signal.aborted ? { leaked: "must-not-return" } : { ok: true };
    },
  });
  const session = cancellable.connect("vision");
  if (session.status !== "PRESENT") throw new Error("unreachable");
  const send = session.session.send({ fixture: true });
  expect(session.session.cancel()).toEqual({ status: "PRESENT", state: "cancelled" });
  expect(await send).toEqual({ status: "UNKNOWN", failClosed: true, reason: "sidecar-session-cancelled" });
});

test("runtime WebSocket bridge authorizes a configured local facade and closes invalid messages fail-closed", async () => {
  const token = ["fixture", "socket", "token"].join("-");
  const runtime = await startRuntime({
    env: { CODEX_HOME: await mkdtemp(join(tmpdir(), "ws-codex-")), COSTGUARD_HOME: await mkdtemp(join(tmpdir(), "ws-state-")) },
    providers: {},
    managementToken: token,
    sidecarFacade: new SidecarFacade({
      capabilities: new Set(["web-search"]), authorized: true,
      invoke: async (_kind, message) => ({ echoed: message }),
    }),
  });
  const url = runtime.baseUrl.replace(/^http/, "ws") + "/v1/sidecars/web-search";
  const exchange = (payload: string) => new Promise<{ message: unknown; close?: number }>((resolve, reject) => {
    const socket = new WebSocket(url, token);
    socket.addEventListener("open", () => socket.send(payload));
    socket.addEventListener("message", (event) => { resolve({ message: JSON.parse(String(event.data)) }); socket.close(); });
    socket.addEventListener("close", (event) => { if (event.code === 4400) resolve({ message: undefined, close: event.code }); });
    socket.addEventListener("error", () => reject(new Error("websocket-client-error")));
  });
  try {
    await expect(exchange(JSON.stringify({ query: "isolated fixture" }))).resolves.toEqual({ message: { status: "PRESENT", result: { echoed: { query: "isolated fixture" } } } });
    await expect(exchange("null")).resolves.toEqual({ message: { status: "UNKNOWN", failClosed: true, reason: "sidecar-message-invalid" } });
  } finally { runtime.stop(); }
});
