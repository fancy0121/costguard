import { expect, test } from "bun:test";
import { selectSidecar } from "../src/sidecars/capabilities";

test("sidecar selection is explicit and safely degrades unavailable capability", () => {
  expect(selectSidecar("images", true, new Set(["images"]))).toEqual({ status: "PRESENT", kind: "images" });
  expect(selectSidecar("vision", true, new Set())).toEqual({
    status: "UNKNOWN",
    failClosed: true,
    reason: "sidecar-unavailable",
  });
  expect(selectSidecar("web-search", false, new Set())).toEqual({ status: "MISSING", reason: "capability-not-requested" });
});
