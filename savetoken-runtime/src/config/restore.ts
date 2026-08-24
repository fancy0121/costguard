import { createHash } from "node:crypto";

function hashLine(line: string): string {
  return createHash("sha256").update(line, "utf8").digest("hex");
}

export function formatOwnedConfigMarker(key: string, assignmentLine: string): string {
  return `# savetoken-owned: ${key} sha256=${hashLine(assignmentLine)}`;
}

export function restoreOwnedConfig(content: string): string {
  const lines = content.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const marker = line.match(/^\s*#\s*savetoken-owned:\s*([A-Za-z0-9_.-]+)(?:\s+sha256=([a-f0-9]{64}))?\s*$/);
    if (marker) {
      const previous = kept.at(-1);
      const assignment = previous?.match(/^\s*([A-Za-z0-9_.-]+)\s*=/);
      if (assignment?.[1] === marker[1] && marker[2] && previous && hashLine(previous) === marker[2]) kept.pop();
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
}
