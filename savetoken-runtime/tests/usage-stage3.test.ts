import { expect, test } from "bun:test";
import { UsageLog } from "../src/usage/log";

test("usage log is bounded and stores only redacted usage metadata", () => {
  const log = new UsageLog(2);
  log.append({ provider: "fixture", model: "model-a", outcome: "PRESENT", promptTokens: 1, completionTokens: 2 });
  log.append({ provider: "fixture", model: "model-b", outcome: "UNKNOWN" });
  log.append({ provider: "fixture", model: "model-c", outcome: "PRESENT", promptTokens: 3, completionTokens: 4 });

  expect(log.entries()).toHaveLength(2);
  expect(log.entries()[0]).not.toHaveProperty("prompt");
  expect(log.summary()).toEqual({ requests: 2, measuredTokenRequests: 1, unreportedRequests: 1 });
});
