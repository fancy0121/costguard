import { expect, test } from "bun:test";
import { mapProviderError } from "../src/server/errors";

test("provider errors map to stable redacted client errors", () => {
  expect(mapProviderError({ status: 429, message: "provider quota detail" })).toEqual({
    status: "UNKNOWN",
    httpStatus: 429,
    code: "provider_rate_limited",
    message: "provider request unavailable",
  });
  expect(mapProviderError(new Error("secret-like upstream body"))).toEqual({
    status: "UNKNOWN",
    httpStatus: 502,
    code: "provider_request_failed",
    message: "provider request unavailable",
  });
});
