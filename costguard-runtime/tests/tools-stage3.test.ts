import { expect, test } from "bun:test";
import { collectToolGroups } from "../src/server/tools";

test("Responses tool collection preserves top-level and additional tool groups in order", () => {
  const primary = { type: "function", name: "lookup" };
  const additional = { type: "function", name: "search" };
  expect(collectToolGroups("responses", {
    tools: [primary],
    input: [{ type: "additional_tools", tools: [additional] }],
  })).toEqual([[primary], [additional]]);
});

test("Chat and Anthropic tool collection preserves the protocol-owned top-level group", () => {
  const tool = { type: "function", name: "lookup" };
  expect(collectToolGroups("chat", { tools: [tool] })).toEqual([[tool]]);
  expect(collectToolGroups("anthropic", { tools: [tool] })).toEqual([[tool]]);
  expect(collectToolGroups("responses", { input: "hello" })).toEqual([]);
});
