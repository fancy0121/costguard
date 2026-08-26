import { expect, test } from "bun:test";
import { runtimeOptionsFromEnvironment } from "../src/config/entrypoint";

test("runtime entrypoint forwards management token reference and a discoverable port", () => {
  expect(runtimeOptionsFromEnvironment({ COSTGUARD_MANAGEMENT_TOKEN: "fixture", COSTGUARD_PORT: "8787" }, { fixture: ["model-a"] })).toEqual({
    env: { COSTGUARD_MANAGEMENT_TOKEN: "fixture", COSTGUARD_PORT: "8787" },
    providers: { fixture: ["model-a"] },
    managementToken: "fixture",
    port: 8787,
  });
});

test("runtime entrypoint attaches only the explicit loopback OpenCodex proxy boundary", () => {
  const options = runtimeOptionsFromEnvironment({ COSTGUARD_OPENCODEX_PROXY_URL: "http://127.0.0.1:10100" }, {
    deepseek: ["deepseek-v4-flash"],
  });
  expect(options.providerAdapters).toHaveLength(3);
  expect(options.providerAdapters?.flatMap((adapter) => adapter.descriptor.models)).toContain("deepseek-v4-flash");
  expect(options.providerAdapters?.some((adapter) => adapter.descriptor.auth === "proxy")).toBe(true);
});
