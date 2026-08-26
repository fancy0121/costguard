import { describe, expect, test } from "bun:test";
import { selectSidecar } from "../src/sidecars/capabilities";
import { admitWebSocket } from "../src/server/websocket";

describe("Sidecar success paths", () => {
  test("configured capability selects PRESENT", () => {
    const result = selectSidecar("web-search", true, new Set(["web-search", "vision"]));
    expect(result.status).toBe("PRESENT");
    if (result.status === "PRESENT") expect(result.kind).toBe("web-search");
  });

  test("not-requested returns MISSING", () => {
    const result = selectSidecar("vision", false, new Set(["vision"]));
    expect(result.status).toBe("MISSING");
  });

  test("permission boundary: capability not in whitelist → UNKNOWN", () => {
    // Even if requested, an unavailable capability fails closed
    const result = selectSidecar("images", true, new Set(["web-search"]));
    expect(result.status).toBe("UNKNOWN");
  });
});

describe("WebSocket lifecycle", () => {
  test("authorized websocket admits PRESENT", () => {
    const result = admitWebSocket(true, new Set(["websocket"]));
    expect(result.status).toBe("PRESENT");
  });

  test("close/cancel path: not requested returns MISSING", () => {
    const result = admitWebSocket(false, new Set(["websocket"]));
    expect(result.status).toBe("MISSING");
  });

  test("unauthorized capability fails closed", () => {
    const result = admitWebSocket(true, new Set([]));
    expect(result.status).toBe("UNKNOWN");
  });
});