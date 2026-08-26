import type { RuntimeOptions } from "../server/runtime";
import { createOpenCodexProxyAdapters } from "../providers/opencodex-proxy";

export function runtimeOptionsFromEnvironment(
  env: Record<string, string | undefined>,
  providers: Record<string, string[]>,
): Pick<RuntimeOptions, "env" | "providers" | "defaultProvider" | "managementToken" | "port" | "providerAdapters"> {
  const configuredPort = Number.parseInt(env.COSTGUARD_PORT ?? "8787", 10);
  const port = Number.isInteger(configuredPort) && configuredPort >= 0 && configuredPort <= 65535 ? configuredPort : 8787;
  const proxyBaseUrl = env.COSTGUARD_OPENCODEX_PROXY_URL;
  return {
    env,
    providers,
    ...(env.COSTGUARD_DEFAULT_PROVIDER ? { defaultProvider: env.COSTGUARD_DEFAULT_PROVIDER } : {}),
    managementToken: env.COSTGUARD_MANAGEMENT_TOKEN,
    port,
    ...(proxyBaseUrl ? { providerAdapters: createOpenCodexProxyAdapters({ baseUrl: proxyBaseUrl }) } : {}),
  };
}
