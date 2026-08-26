import type { CostGuardRouteDecision, CostGuardTaskSignals, CostGuardTier } from "../types";

const SECURITY_WORDS = /security|permission|credential|authentication|安全|权限|凭据|认证/i;
const PRODUCTION_WORDS = /production|migration|database|deployment|release|生产|迁移|数据库|部署|上线|发布/i;
const ARCHITECTURE_WORDS = /architecture|major refactor|blocker|outage|架构|重构|阻塞|故障|重大改造/i;
const HIGH_RISK_WORDS = new RegExp(`${SECURITY_WORDS.source}|${PRODUCTION_WORDS.source}|${ARCHITECTURE_WORDS.source}`, "i");

const TEXT_HEAVY_WORDS = /extract|classify|format|parse|convert|summarize|translate|sort|filter|count|list|find|search|read|analyze text|text analy/i;
const TOOL_FILE_WORDS = /edit|rename|move|copy|compile|test|deploy|install|patch|refactor|fix bug|add file|modify file|change file|write code|create file|delete file/i;

export type AvailabilityState = "available" | "unavailable" | "unknown";

export function isTierAllowed(taskTier: CostGuardTier, candidateTier: CostGuardTier): boolean {
  if (taskTier === "sol") return candidateTier === "sol";
  if (taskTier === "terra") return candidateTier === "sol" || candidateTier === "terra";
  if (taskTier === "execution") return true;
  return candidateTier === "glm-backup";
}

export function decideRoute(signals: CostGuardTaskSignals): CostGuardRouteDecision {
  const text = signals.text.trim();
  const escalationReasons: string[] = [];

  // Phase 1: Hard safety signals → Sol
  if (signals.hasSecurityOrPermissionImpact || SECURITY_WORDS.test(text)) escalationReasons.push("security-or-permission-impact");
  if (signals.hasProductionOrMigrationImpact || PRODUCTION_WORDS.test(text)) escalationReasons.push("production-or-migration-impact");
  if (signals.blocker || ARCHITECTURE_WORDS.test(text)) escalationReasons.push("architecture-or-blocker");
  if (escalationReasons.length > 0) {
    return { tier: "sol", candidates: ["gpt-5.6-sol"], escalationReasons, failClosed: true };
  }

  // Phase 2: Underspecified → Terra (safety)
  if (!text || text.length < 20) {
    return { tier: "terra", candidates: ["gpt-5.6-terra"], escalationReasons: ["insufficient-task-signals"], failClosed: true };
  }

  // Phase 3: Cross-module → Terra
  if ((signals.modulesTouched ?? 0) > 2) {
    return { tier: "terra", candidates: ["gpt-5.6-terra"], escalationReasons: ["bounded-cross-module-scope"], failClosed: true };
  }

  // Phase 4: Explicit execution signals → execution
  if (signals.isBatchOrRepetitive || signals.isToolOrFileExecution) {
    const isText = TEXT_HEAVY_WORDS.test(text);
    const isTool = TOOL_FILE_WORDS.test(text);
    const candidates: string[] = [];
    if (isText || (!isTool && !TEXT_HEAVY_WORDS.test(text))) candidates.push("deepseek-v4-flash");
    if (isTool || (!isText && !TOOL_FILE_WORDS.test(text))) candidates.push("gpt-5.6-luna");
    if (candidates.length === 0) candidates.push("deepseek-v4-flash", "gpt-5.6-luna");
    return { tier: "execution", candidates, escalationReasons: [], failClosed: false };
  }

  // Phase 5: Text-heavy without signals → execution (DeepSeek preferred)
  if (TEXT_HEAVY_WORDS.test(text) && !TOOL_FILE_WORDS.test(text)) {
    return { tier: "execution", candidates: ["deepseek-v4-flash"], escalationReasons: ["text-heavy-execution-candidate"], failClosed: false };
  }

  // Phase 6: Tool/file without signals → execution (Luna preferred)
  if (TOOL_FILE_WORDS.test(text) && !TEXT_HEAVY_WORDS.test(text)) {
    return { tier: "execution", candidates: ["gpt-5.6-luna"], escalationReasons: ["tool-file-execution-candidate"], failClosed: false };
  }

  // Phase 7: Large file-scope → Terra
  if ((signals.filesChanged ?? 0) > 10) {
    return { tier: "terra", candidates: ["gpt-5.6-terra"], escalationReasons: ["bounded-cross-file-scope"], failClosed: true };
  }

  // Phase 8: Default safety → Terra
  return { tier: "terra", candidates: ["gpt-5.6-terra"], escalationReasons: HIGH_RISK_WORDS.test(text) ? ["conservative-medium-complexity-route"] : [], failClosed: true };
}
