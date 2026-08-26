export type ProviderKeyHealth = "healthy" | "degraded" | "unavailable" | "unknown";

export type ProviderKeyReference = {
  id: string;
  provider: string;
  envVar: string;
  health: ProviderKeyHealth;
  cooldownUntil?: number;
};

export type ProviderKeySelection =
  | { status: "PRESENT"; keyId: string }
  | { status: "UNKNOWN"; failClosed: true; reason: "no-eligible-provider-key" };

function validEnvVar(value: string): boolean {
  return /^[A-Z][A-Z0-9_]{2,}$/.test(value);
}

export function selectProviderKey(
  keys: ProviderKeyReference[],
  options: { provider: string; now: number },
): ProviderKeySelection {
  if (!Number.isFinite(options.now)) return { status: "UNKNOWN", failClosed: true, reason: "no-eligible-provider-key" };
  const selected = keys.find((key) => (
    key.provider === options.provider
    && validEnvVar(key.envVar)
    && (key.health === "healthy" || key.health === "degraded")
    && (key.cooldownUntil === undefined || (Number.isFinite(key.cooldownUntil) && key.cooldownUntil <= options.now))
  ));
  return selected
    ? { status: "PRESENT", keyId: selected.id }
    : { status: "UNKNOWN", failClosed: true, reason: "no-eligible-provider-key" };
}
