import { expect, test } from "bun:test";
import { resolveProviderModel } from "../src/providers/route";

test("explicit provider/model identity wins over the default provider", () => {
  const result = resolveProviderModel({
    defaultProvider: "openai",
    providers: { openai: ["gpt-5.6-sol"], deepseek: ["deepseek-v4-flash"] },
    requestedModel: "deepseek/deepseek-v4-flash",
  });

  expect(result.status).toBe("PRESENT");
  expect(result.provider).toBe("deepseek");
  expect(result.model).toBe("deepseek-v4-flash");
});

test("unknown explicit providers fail closed instead of falling through", () => {
  const result = resolveProviderModel({
    defaultProvider: "openai",
    providers: { openai: ["gpt-5.6-sol"] },
    requestedModel: "missing/model",
  });

  expect(result.status).toBe("UNKNOWN");
  expect(result.failClosed).toBe(true);
});

test("default provider is used only when no explicit route is requested", () => {
  const result = resolveProviderModel({
    defaultProvider: "openai",
    providers: { openai: ["gpt-5.6-sol"] },
  });

  expect(result.status).toBe("PRESENT");
  expect(result.provider).toBe("openai");
  expect(result.model).toBe("gpt-5.6-sol");
});

test("bare models resolve only when exactly one configured provider owns them", () => {
  expect(resolveProviderModel({
    defaultProvider: "openai",
    providers: { openai: ["gpt-5.6-sol"], deepseek: ["deepseek-v4-flash"] },
    requestedModel: "deepseek-v4-flash",
  })).toMatchObject({ status: "PRESENT", provider: "deepseek", model: "deepseek-v4-flash" });
  expect(resolveProviderModel({
    defaultProvider: "openai",
    providers: { openai: ["shared"], deepseek: ["shared"] },
    requestedModel: "shared",
  })).toEqual({ status: "UNKNOWN", failClosed: true, reason: "provider-model-ambiguous" });
});

test("missing or invalid default provider fails closed instead of using object order", () => {
  expect(resolveProviderModel({ defaultProvider: "", providers: { openai: ["gpt-5.6-sol"] } })).toEqual({
    status: "UNKNOWN", failClosed: true, reason: "provider-default-unconfigured",
  });
  expect(resolveProviderModel({ defaultProvider: "missing", providers: { openai: ["gpt-5.6-sol"] } })).toEqual({
    status: "UNKNOWN", failClosed: true, reason: "provider-default-unconfigured",
  });
});
