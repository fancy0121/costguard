import { expect, test } from "bun:test";
import { invokeWithFailover, ProviderRegistry, type ProviderAdapter } from "../src/providers/registry";

function adapter(id: string, model: string, tier: "execution" | "glm-backup", result: { status: "PRESENT" | "UNKNOWN"; actualRuntimeModel: string; reason?: string }): ProviderAdapter {
  return { descriptor: { id, models: [model], auth: "fixture", health: "healthy", tier, capabilities: ["responses"] }, invoke: async () => result };
}

test("only an explicit unavailable result permits Luna to DeepSeek execution fallback", async () => {
  const registry = new ProviderRegistry([
    adapter("openai", "gpt-5.6-luna", "execution", { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "provider-unavailable" }),
    adapter("deepseek", "deepseek-v4-flash", "execution", { status: "PRESENT", actualRuntimeModel: "deepseek/deepseek-v4-flash" }),
  ]);
  await expect(invokeWithFailover(registry, ["openai/gpt-5.6-luna", "deepseek/deepseek-v4-flash"], {
    protocol: "responses", signal: new AbortController().signal, tier: "execution",
  })).resolves.toMatchObject({ status: "PRESENT", fallbackUsed: true, fallbackChain: ["openai/gpt-5.6-luna", "deepseek/deepseek-v4-flash"] });
});

test("401, 403, 429, 5xx, network, and identity failures stop the execution chain", async () => {
  for (const reason of ["provider-auth-failed", "provider-forbidden", "provider-rate-limited", "provider-request-failed", "proxy-request-failed", "provider-evidence-unverified"]) {
    const registry = new ProviderRegistry([
      adapter("luna", "model", "execution", { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason }),
      adapter("deepseek", "flash", "execution", { status: "PRESENT", actualRuntimeModel: "deepseek/flash" }),
    ]);
    const result = await invokeWithFailover(registry, ["luna/model", "deepseek/flash"], { protocol: "responses", signal: new AbortController().signal, tier: "execution" });
    expect(result).toEqual({ status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason });
  }
});

test("GLM is reached only after both execution peers explicitly report unavailable", async () => {
  const registry = new ProviderRegistry([
    adapter("luna", "model", "execution", { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "provider-unavailable" }),
    adapter("deepseek", "flash", "execution", { status: "UNKNOWN", actualRuntimeModel: "UNKNOWN", reason: "provider-unavailable" }),
    adapter("glm", "glm-5.2", "glm-backup", { status: "PRESENT", actualRuntimeModel: "glm/glm-5.2" }),
  ]);
  await expect(invokeWithFailover(registry, ["luna/model", "deepseek/flash", "glm/glm-5.2"], {
    protocol: "responses", signal: new AbortController().signal, tier: "execution",
  })).resolves.toMatchObject({ status: "PRESENT", actualRuntimeModel: "glm/glm-5.2", fallbackUsed: true });
});
