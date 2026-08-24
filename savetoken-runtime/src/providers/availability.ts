export type ProviderAccountHealth = "healthy" | "degraded" | "unavailable" | "unknown";

export type ProviderQuota =
  | { status: "measured"; remaining: number }
  | { status: "unknown" };

export type ProviderAccountState = {
  id: string;
  provider: string;
  priority?: number;
  health: ProviderAccountHealth;
  quota: ProviderQuota;
  cooldownUntil?: number;
  affinityKey?: string;
};

export type ProviderAccountSelection =
  | { status: "PRESENT"; accountId: string; reason: "affinity" | "quota" }
  | { status: "UNKNOWN"; failClosed: true; reason: "no-eligible-provider-account" };

function eligible(account: ProviderAccountState, now: number): boolean {
  if (account.health !== "healthy" && account.health !== "degraded") return false;
  if (!Number.isFinite(now)) return false;
  if (account.quota.status !== "measured" || !Number.isFinite(account.quota.remaining) || account.quota.remaining <= 0) return false;
  if (account.cooldownUntil !== undefined && (!Number.isFinite(account.cooldownUntil) || account.cooldownUntil > now)) return false;
  return true;
}

export function selectProviderAccount(
  accounts: ProviderAccountState[],
  options: { provider: string; now: number; affinityKey?: string },
): ProviderAccountSelection {
  const eligibleAccounts = accounts.filter((account) => account.provider === options.provider && eligible(account, options.now));
  if (options.affinityKey) {
    const affinity = eligibleAccounts.find((account) => account.affinityKey === options.affinityKey);
    if (affinity) return { status: "PRESENT", accountId: affinity.id, reason: "affinity" };
  }

  const byQuota = [...eligibleAccounts].sort((left, right) => {
    const leftPriority = Number.isFinite(left.priority) ? left.priority! : 0;
    const rightPriority = Number.isFinite(right.priority) ? right.priority! : 0;
    if (leftPriority !== rightPriority) return rightPriority - leftPriority;
    const leftRemaining = left.quota.status === "measured" ? left.quota.remaining : -1;
    const rightRemaining = right.quota.status === "measured" ? right.quota.remaining : -1;
    return rightRemaining - leftRemaining;
  });
  const selected = byQuota[0];
  if (!selected) return { status: "UNKNOWN", failClosed: true, reason: "no-eligible-provider-account" };
  return { status: "PRESENT", accountId: selected.id, reason: "quota" };
}
