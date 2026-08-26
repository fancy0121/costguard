import { expect, test } from "bun:test";
import { credentialReference } from "../src/providers/auth";

test("credential references keep OAuth and API-key modes separate without reading values", () => {
  expect(credentialReference({ mode: "oauth", envVar: "FIXTURE_OAUTH_REF" })).toEqual({
    status: "PRESENT",
    mode: "oauth",
    envVar: "FIXTURE_OAUTH_REF",
  });
  expect(credentialReference({ mode: "api-key", envVar: "FIXTURE_API_KEY_REF" })).toEqual({
    status: "PRESENT",
    mode: "api-key",
    envVar: "FIXTURE_API_KEY_REF",
  });
  expect(credentialReference({ mode: "api-key", envVar: "plain-value" })).toEqual({
    status: "UNKNOWN",
    reason: "credential-reference-invalid",
  });
});
