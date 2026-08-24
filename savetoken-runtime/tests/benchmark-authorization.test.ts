import { expect, test } from "bun:test";
import { benchmarkAuthorization } from "../src/benchmark/authorization";

test("real quality benchmark requires an explicit one-shot authorization and fails closed by default", () => {
  expect(benchmarkAuthorization({})).toEqual({ status: "UNKNOWN", failClosed: true, reason: "real-provider-benchmark-not-authorized" });
  expect(benchmarkAuthorization({ SAVETOKEN_ALLOW_REAL_BENCHMARK: "1" })).toEqual({ status: "PRESENT" });
  expect(benchmarkAuthorization({ SAVETOKEN_ALLOW_REAL_BENCHMARK: "true" })).toEqual({ status: "UNKNOWN", failClosed: true, reason: "real-provider-benchmark-not-authorized" });
});
