import { expect, test } from "bun:test";
import { CancellationToken, cancellationTokenFor } from "../src/server/cancellation";
import { parseAnthropicRequest, parseChatRequest, parseResponsesRequest, terminalState } from "../src/server/protocol";

test("parses Chat requests while preserving tools and stripping SaveToken fields", () => {
  const result = parseChatRequest({
    model: "openai/gpt-5.6-sol",
    messages: [{ role: "user", content: "hello" }],
    tools: [{ type: "function", function: { name: "lookup" } }],
    savetokenTask: "classify this request",
    savetokenTier: "execution",
    savetokenRoute: "deepseek/model-a",
  });

  expect(result.validation).toEqual({ valid: true });
  expect(result.normalized.model).toBe("openai/gpt-5.6-sol");
  expect(result.normalized.messages).toHaveLength(1);
  expect(result.normalized.tools).toEqual([{ type: "function", function: { name: "lookup" } }]);
  expect(result.normalized.pureBody).toEqual({
    model: "openai/gpt-5.6-sol",
    messages: [{ role: "user", content: "hello" }],
    tools: [{ type: "function", function: { name: "lookup" } }],
  });
});

test("parses Responses input arrays and preserves tool definitions", () => {
  const result = parseResponsesRequest({
    model: "fixture/model-a",
    input: [{ role: "user", content: "hello" }],
    tools: [{ type: "function", name: "lookup" }],
  });

  expect(result.validation).toEqual({ valid: true });
  expect(result.normalized.messages).toEqual([{ role: "user", content: "hello" }]);
  expect(result.normalized.tools).toEqual([{ type: "function", name: "lookup" }]);
});

test("parses Anthropic message arrays without claiming unsupported input", () => {
  const result = parseAnthropicRequest({
    model: "fixture/model-a",
    max_tokens: 32,
    messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
  });

  expect(result.validation).toEqual({ valid: true });
  expect(result.normalized.messages).toHaveLength(1);
  expect(result.normalized.model).toBe("fixture/model-a");
});

test("rejects protocol requests that omit required fields", () => {
  expect(parseResponsesRequest({ model: "fixture/model-a" }).validation).toEqual({ valid: false, reason: "responses-input-required" });
  expect(parseChatRequest({ model: "fixture/model-a" }).validation).toEqual({ valid: false, reason: "chat-messages-required" });
  expect(parseAnthropicRequest({ model: "fixture/model-a", messages: [{ role: "user", content: "hello" }] }).validation).toEqual({ valid: false, reason: "anthropic-max-tokens-required" });
});

test("distinguishes completed, incomplete, failed, and cancelled terminals", () => {
  expect(terminalState({ type: "response.completed" })).toBe("completed");
  expect(terminalState({ type: "response.incomplete" })).toBe("incomplete");
  expect(terminalState({ type: "response.failed" })).toBe("failed");
  expect(terminalState({ type: "request.cancelled" })).toBe("cancelled");
  expect(terminalState({ type: "response.output_text.delta" })).toBe("incomplete");
});

test("cancellation is observable without rewriting a completed event", () => {
  const token = new CancellationToken();
  expect(token.cancelled).toBe(false);
  token.cancel();
  expect(token.cancelled).toBe(true);
  expect(terminalState({ type: "response.completed" }, token)).toBe("cancelled");
});

test("request abort signals cancel the bound token", () => {
  const controller = new AbortController();
  const binding = cancellationTokenFor(controller.signal);

  expect(binding.token.cancelled).toBe(false);
  controller.abort();
  expect(binding.token.cancelled).toBe(true);

  binding.dispose();
});
