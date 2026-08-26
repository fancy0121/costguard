import { expect, test } from "bun:test";
import { classifySseFrame, parseSseText } from "../src/server/sse";

test("SSE parser handles optional colon spaces, multiline data, comments, and EOF dispatch", () => {
  expect(parseSseText([
    ": keepalive",
    "event: response.output_text.delta",
    "id: delta-1",
    "data:{\"type\":\"response.output_text.delta\",\"delta\":\"a\"}",
    "",
    "data:line one",
    "data:line two",
  ].join("\n"))).toEqual([
    {
      event: "response.output_text.delta",
      id: "delta-1",
      data: "{\"type\":\"response.output_text.delta\",\"delta\":\"a\"}",
    },
    { data: "line one\nline two" },
  ]);
});

test("SSE terminal classification is conservative and preserves failed/cancelled states", () => {
  expect(classifySseFrame({ event: "response.completed", data: "{}" })).toBe("completed");
  expect(classifySseFrame({ event: "response.failed", data: "{}" })).toBe("failed");
  expect(classifySseFrame({ event: "response.output_text.delta", data: "{}" })).toBe("incomplete");
  expect(classifySseFrame({ data: "[DONE]" })).toBe("completed");
  expect(classifySseFrame({ event: "request.cancelled", data: "{}" })).toBe("cancelled");
  expect(classifySseFrame({ event: "response.output_text.delta", data: "not-json" })).toBe("incomplete");
});
