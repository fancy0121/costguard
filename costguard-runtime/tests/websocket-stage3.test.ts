import { expect, test } from "bun:test";
import { admitWebSocket } from "../src/server/websocket";

test("WebSocket admission is explicit and fails closed without capability", () => {
  expect(admitWebSocket(true, new Set(["websocket"]))).toEqual({ status: "PRESENT", protocol: "websocket" });
  expect(admitWebSocket(true, new Set())).toEqual({ status: "UNKNOWN", failClosed: true, reason: "websocket-unavailable" });
  expect(admitWebSocket(false, new Set(["websocket"]))).toEqual({ status: "MISSING", reason: "websocket-not-requested" });
});
