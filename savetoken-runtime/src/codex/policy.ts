export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export type EffortResult =
  | { status: "PRESENT"; effort: EffortLevel }
  | { status: "UNKNOWN"; reason: "effort-unrecognized" };

export function clampEffort(requested: string, ceiling: EffortLevel): EffortResult {
  const requestedIndex = EFFORT_LEVELS.indexOf(requested as EffortLevel);
  const ceilingIndex = EFFORT_LEVELS.indexOf(ceiling);
  if (requestedIndex < 0 || ceilingIndex < 0) return { status: "UNKNOWN", reason: "effort-unrecognized" };
  return { status: "PRESENT", effort: EFFORT_LEVELS[Math.min(requestedIndex, ceilingIndex)] };
}

export type SubagentResolution =
  | { status: "PRESENT"; model: string; fallbackUsed: boolean }
  | { status: "UNKNOWN"; failClosed: true; reason: "high-risk-subagent-fallback-forbidden" | "medium-risk-subagent-fallback-forbidden" };

export function resolveSubagentModel(
  requested: string,
  candidates: string[],
  risk: "low" | "medium" | "high",
  candidateTiers: Record<string, "sol" | "terra" | "execution"> = {},
): SubagentResolution {
  if (risk === "high" && candidates.includes(requested) && candidateTiers[requested] !== "sol" && candidateTiers[requested] !== "terra") {
    return { status: "UNKNOWN", failClosed: true, reason: "high-risk-subagent-fallback-forbidden" };
  }
  if (risk === "medium" && candidates.includes(requested) && candidateTiers[requested] && candidateTiers[requested] === "execution") {
    return { status: "UNKNOWN", failClosed: true, reason: "medium-risk-subagent-fallback-forbidden" };
  }
  if (risk === "medium" && candidates.includes(requested) && candidateTiers[requested] !== "sol" && candidateTiers[requested] !== "terra") {
    return { status: "UNKNOWN", failClosed: true, reason: "medium-risk-subagent-fallback-forbidden" };
  }
  if (candidates.includes(requested)) return { status: "PRESENT", model: requested, fallbackUsed: false };
  if (risk === "high") return { status: "UNKNOWN", failClosed: true, reason: "high-risk-subagent-fallback-forbidden" };
  if (risk === "medium" && candidates.some((candidate) => candidateTiers[candidate] && candidateTiers[candidate] === "execution")) {
    return { status: "UNKNOWN", failClosed: true, reason: "medium-risk-subagent-fallback-forbidden" };
  }
  const fallback = candidates[0];
  if (!fallback) return { status: "UNKNOWN", failClosed: true, reason: "high-risk-subagent-fallback-forbidden" };
  return { status: "PRESENT", model: fallback, fallbackUsed: true };
}

export type ComboResolution =
  | { status: "PRESENT"; routes: string[] }
  | { status: "UNKNOWN"; failClosed: true; reason: "combo-route-unverified" | "high-risk-combo-fallback-forbidden" | "combo-tier-unverified" | "combo-tier-mismatch" | "glm-backup-order-invalid" };

export function resolveCombo(
  routes: string[],
  available: Set<string>,
  options: {
    tier?: "sol" | "terra" | "execution";
    routeTiers?: Record<string, "sol" | "terra" | "execution" | "glm-backup">;
  } = {},
): ComboResolution {
  if (!options.tier) return { status: "UNKNOWN", failClosed: true, reason: "combo-tier-unverified" };
  if (routes.length === 0 || routes.some((route) => !available.has(route))) {
    return { status: "UNKNOWN", failClosed: true, reason: "combo-route-unverified" };
  }
  if (options.tier === "sol" && routes.length > 1) {
    return { status: "UNKNOWN", failClosed: true, reason: "high-risk-combo-fallback-forbidden" };
  }
  if (routes.length > 1 && !options.routeTiers) {
    return { status: "UNKNOWN", failClosed: true, reason: "combo-tier-unverified" };
  }
  if (options.routeTiers) {
    const tiers = routes.map((route) => options.routeTiers?.[route]);
    if (tiers.some((tier) => !tier)) return { status: "UNKNOWN", failClosed: true, reason: "combo-tier-unverified" };
    if (options.tier === "sol" && tiers.some((tier) => tier !== "sol")) {
      return { status: "UNKNOWN", failClosed: true, reason: "combo-tier-mismatch" };
    }
    if (options.tier === "terra" && tiers.some((tier) => tier !== "sol" && tier !== "terra")) {
      return { status: "UNKNOWN", failClosed: true, reason: "combo-tier-mismatch" };
    }
    const glmIndices = tiers.flatMap((tier, index) => tier === "glm-backup" ? [index] : []);
    const executionCount = tiers.filter((tier) => tier === "execution").length;
    if (glmIndices.length > 0 && (glmIndices.length !== 1 || glmIndices[0] !== routes.length - 1 || executionCount < 2)) {
      return { status: "UNKNOWN", failClosed: true, reason: "glm-backup-order-invalid" };
    }
  }
  return { status: "PRESENT", routes: [...routes] };
}

export type ComboStrategy = "failover" | "round-robin";
export type ComboTarget = { route: string; weight?: number };
export type ComboDefinition = {
  id: string;
  aliases?: string[];
  tier: "execution";
  strategy: ComboStrategy;
  targets: ComboTarget[];
};

export type RuntimeComboResolution =
  | { status: "PRESENT"; id: string; routes: string[] }
  | { status: "UNKNOWN"; failClosed: true; reason: "combo-alias-ambiguous" | "combo-route-unverified" | "combo-tier-unverified" | "combo-tier-mismatch" | "combo-no-available-target" | "glm-backup-order-invalid" | "combo-id-unrecognized" };

type Availability = "available" | "unavailable" | "unknown";

const COMBO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Constrained local combo resolver. It deliberately accepts only execution
 * routes and exposes availability-derived candidates; it never infers that
 * unknown is unavailable or that GLM may be promoted early.
 */
export class ComboRouter {
  private readonly cursor = new Map<string, number>();

  constructor(
    private readonly definitions: readonly ComboDefinition[],
    private readonly configuredRoutes: ReadonlySet<string>,
    private readonly routeTiers: Readonly<Record<string, "sol" | "terra" | "execution" | "glm-backup">>,
  ) {}

  accepts(requested: string): boolean {
    if (requested.startsWith("combo/")) return true;
    return this.definitions.some((definition) => definition.aliases?.includes(requested));
  }

  resolve(requested: string, availability: (route: string) => Availability): RuntimeComboResolution {
    const exactId = requested.startsWith("combo/") ? requested.slice("combo/".length) : undefined;
    const matches = this.definitions.filter((definition) => exactId ? definition.id === exactId : definition.aliases?.includes(requested));
    if (matches.length === 0) return { status: "UNKNOWN", failClosed: true, reason: "combo-id-unrecognized" };
    if (matches.length !== 1) return { status: "UNKNOWN", failClosed: true, reason: "combo-alias-ambiguous" };
    const definition = matches[0];
    if (!COMBO_NAME.test(definition.id) || definition.strategy !== "failover" && definition.strategy !== "round-robin" || definition.tier !== "execution" || definition.targets.length === 0) {
      return { status: "UNKNOWN", failClosed: true, reason: "combo-tier-unverified" };
    }
    if ((definition.aliases ?? []).some((alias) => !COMBO_NAME.test(alias) || alias.startsWith("combo"))) {
      return { status: "UNKNOWN", failClosed: true, reason: "combo-tier-unverified" };
    }
    const routes = definition.targets.map((target) => target.route);
    if (new Set(routes).size !== routes.length || routes.some((route) => !this.configuredRoutes.has(route))) {
      return { status: "UNKNOWN", failClosed: true, reason: "combo-route-unverified" };
    }
    const tiers = routes.map((route) => this.routeTiers[route]);
    if (tiers.some((tier) => !tier)) return { status: "UNKNOWN", failClosed: true, reason: "combo-tier-unverified" };
    if (tiers.some((tier) => tier !== "execution" && tier !== "glm-backup")) return { status: "UNKNOWN", failClosed: true, reason: "combo-tier-mismatch" };
    const glmIndex = tiers.indexOf("glm-backup");
    // A combo selection happens before an invocation. It cannot prove that both
    // execution peers failed during this request, so GLM stays outside combos.
    if (glmIndex >= 0) {
      return { status: "UNKNOWN", failClosed: true, reason: "glm-backup-order-invalid" };
    }
    if (definition.targets.some((target) => target.weight !== undefined && (!Number.isInteger(target.weight) || target.weight! <= 0 || target.weight! > 32))) {
      return { status: "UNKNOWN", failClosed: true, reason: "combo-tier-unverified" };
    }
    const available = routes.filter((route) => availability(route) === "available");
    if (available.length === 0) return { status: "UNKNOWN", failClosed: true, reason: "combo-no-available-target" };
    if (definition.strategy === "failover") return { status: "PRESENT", id: definition.id, routes: available };
    const expanded = available.flatMap((route) => {
      const target = definition.targets.find((candidate) => candidate.route === route)!;
      return Array.from({ length: target.weight ?? 1 }, () => route);
    });
    const start = (this.cursor.get(definition.id) ?? 0) % expanded.length;
    const ordered = [...expanded.slice(start), ...expanded.slice(0, start)].filter((route, index, all) => all.indexOf(route) === index);
    return { status: "PRESENT", id: definition.id, routes: ordered };
  }

  recordSuccess(id: string, route: string): void {
    const definition = this.definitions.find((candidate) => candidate.id === id);
    if (!definition || definition.strategy !== "round-robin") return;
    const expanded = definition.targets.flatMap((target) => Array.from({ length: target.weight ?? 1 }, () => target.route));
    const current = (this.cursor.get(id) ?? 0) % expanded.length;
    // Advance the exact selected weight slot; do not reset to the first matching
    // route, because duplicate weighted slots intentionally share a route id.
    const index = expanded[current] === route ? current : expanded.indexOf(route);
    if (index >= 0) this.cursor.set(id, (index + 1) % expanded.length);
  }
}
