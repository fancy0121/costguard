import { expect, test } from "bun:test";

const tasks = [
  ["text-extraction", "execution", "deepseek/deepseek-v4-flash", "beta"],
  ["classification", "execution", "deepseek/deepseek-v4-flash", "bird"],
  ["format-conversion", "execution", "deepseek/deepseek-v4-flash", "value"],
  ["batch-document-organization", "execution", "deepseek/deepseek-v4-flash", "a,b,c"],
  ["tool-call", "execution", "openai/gpt-5.6-luna", "rename_fixture"],
  ["multi-turn-tool", "execution", "openai/gpt-5.6-luna", "7"],
  ["file-code-execution", "execution", "openai/gpt-5.6-luna", "beta"],
  ["test-design", "terra", "openai/gpt-5.6-terra", "3"],
  ["code-review", "terra", "openai/gpt-5.6-terra", "division-by-zero"],
  ["cross-file-analysis", "terra", "openai/gpt-5.6-terra", "dependency"],
  ["security-permission", "sol", "openai/gpt-5.6-sol", "review-required"],
  ["migration-production", "sol", "openai/gpt-5.6-sol", "review-required"],
].map(([category, expectedTier, expectedModel, answer], index) => ({ id: `Q${String(index + 1).padStart(2, "0")}`, category, input: `synthetic ${category}`, goal: "bounded quality contract", scope: "synthetic only", nonGoals: "no secrets or external data", expectedTier, expectedModel, acceptance: { type: "json_answer", expected: { answer } } }));

test("quality-routing benchmark fixes twelve non-sensitive tasks with route, scope, and strict acceptance contracts", () => {
  expect(tasks).toHaveLength(12);
  expect(new Set(tasks.map((task) => task.category)).size).toBe(12);
  for (const task of tasks) {
    expect(typeof task.id).toBe("string");
    expect(typeof task.input).toBe("string");
    expect(typeof task.goal).toBe("string");
    expect(typeof task.scope).toBe("string");
    expect(typeof task.nonGoals).toBe("string");
    expect(typeof task.expectedTier).toBe("string");
    expect(typeof task.expectedModel).toBe("string");
    expect(task.acceptance.type).toBe("json_answer");
    expect(typeof task.acceptance.expected.answer).toBe("string");
    expect(task.input).not.toMatch(/api[_ -]?key|password|cookie|private key/i);
  }
});
