import type { ProtocolKind } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function collectToolGroups(kind: ProtocolKind, body: Record<string, unknown>): unknown[][] {
  const groups: unknown[][] = [];
  if (Array.isArray(body.tools)) groups.push(body.tools);
  if (kind !== "responses" || !Array.isArray(body.input)) return groups;
  for (const item of body.input) {
    if (!isRecord(item) || item.type !== "additional_tools" || !Array.isArray(item.tools)) continue;
    groups.push(item.tools);
  }
  return groups;
}
