export type MultiAgentSurfaceResult =
  | { status: "PRESENT"; mode: "v1" | "v2"; subagentModels: string[] }
  | { status: "UNKNOWN"; failClosed: true; reason: "multi-agent-mode-unverified" | "subagent-model-unverified" };

export function resolveMultiAgentSurface(
  mode: string,
  requestedModels: string[],
  availableModels: Set<string>,
): MultiAgentSurfaceResult {
  if (mode !== "v1" && mode !== "v2") return { status: "UNKNOWN", failClosed: true, reason: "multi-agent-mode-unverified" };
  if (requestedModels.length === 0 || requestedModels.some((model) => !availableModels.has(model))) {
    return { status: "UNKNOWN", failClosed: true, reason: "subagent-model-unverified" };
  }
  return { status: "PRESENT", mode, subagentModels: [...requestedModels] };
}
