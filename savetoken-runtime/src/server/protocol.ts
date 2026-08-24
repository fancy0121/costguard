import type { CancellationToken } from "./cancellation";
import type { ProtocolKind, AnthropicMessageResponse, ChatCompletionResponse, NormalizedRequest, ResponsesResponse } from "../types";
import { createHash } from "node:crypto";

function stripInternalFields(body: Record<string, unknown>): Record<string, unknown> {
  const pure: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!key.toLowerCase().startsWith("savetoken")) pure[key] = value;
  }
  return pure;
}

export function parseResponsesRequest(body: Record<string, unknown>): {
  normalized: NormalizedRequest;
  validation: { valid: true } | { valid: false; reason: string };
} {
  const pureBody = stripInternalFields(body);
  const model = typeof body.model === "string" && body.model.trim() ? body.model : "UNKNOWN";
  const input = body.input;
  const messages: Array<Record<string, unknown>> = Array.isArray(input)
    ? input as Array<Record<string, unknown>>
    : typeof input === "string"
      ? [{ role: "user", content: input }]
      : [];
  if (!Array.isArray(input) && typeof input !== "string") {
    return { normalized: { model, messages, protocol: "responses", pureBody }, validation: { valid: false, reason: "responses-input-required" } };
  }
  return {
    normalized: { model, messages, tools: Array.isArray(body.tools) ? body.tools as Array<Record<string, unknown>> : undefined, protocol: "responses", pureBody },
    validation: { valid: true },
  };
}

export function parseChatRequest(body: Record<string, unknown>): {
  normalized: NormalizedRequest;
  validation: { valid: true } | { valid: false; reason: string };
} {
  const pureBody = stripInternalFields(body);
  const model = typeof body.model === "string" && body.model.trim() ? body.model : "UNKNOWN";
  const messages = Array.isArray(body.messages) ? body.messages as Array<Record<string, unknown>> : [];
  if (messages.length === 0) {
    return { normalized: { model, messages, protocol: "chat", pureBody }, validation: { valid: false, reason: "chat-messages-required" } };
  }
  return {
    normalized: { model, messages, tools: Array.isArray(body.tools) ? body.tools as Array<Record<string, unknown>> : undefined, protocol: "chat", pureBody },
    validation: { valid: true },
  };
}

export function parseAnthropicRequest(body: Record<string, unknown>): {
  normalized: NormalizedRequest;
  validation: { valid: true } | { valid: false; reason: string };
} {
  const pureBody = stripInternalFields(body);
  const model = typeof body.model === "string" && body.model.trim() ? body.model : "UNKNOWN";
  const messages = Array.isArray(body.messages) ? body.messages as Array<Record<string, unknown>> : [];
  if (messages.length === 0) {
    return { normalized: { model, messages, protocol: "anthropic", pureBody }, validation: { valid: false, reason: "anthropic-messages-required" } };
  }
  if (typeof body.max_tokens !== "number" || body.max_tokens <= 0) {
    return { normalized: { model, messages, protocol: "anthropic", pureBody }, validation: { valid: false, reason: "anthropic-max-tokens-required" } };
  }
  return {
    normalized: { model, messages, tools: Array.isArray(body.tools) ? body.tools as Array<Record<string, unknown>> : undefined, protocol: "anthropic", pureBody },
    validation: { valid: true },
  };
}

export type ToolContinuationValidation = { valid: true } | { valid: false; reason: string };

function validateReferencedToolIds(issued: Set<string>, completed: Set<string>, results: unknown[]): ToolContinuationValidation {
  for (const result of results) {
    if (typeof result !== "object" || result === null) continue;
    const record = result as Record<string, unknown>;
    const callId = record.call_id ?? record.tool_call_id ?? record.tool_use_id;
    if (typeof callId !== "string" || !callId) return { valid: false, reason: "quality-tool-missing-call-id" };
    if (!issued.has(callId)) return { valid: false, reason: "quality-tool-unknown-call-id" };
    if (completed.has(callId)) return { valid: false, reason: "quality-tool-duplicate-result" };
    completed.add(callId);
  }
  return { valid: true };
}

/** Validate tool-result references embedded in one OpenAI Chat transcript. */
export function validateChatToolContinuation(messages: unknown): ToolContinuationValidation {
  if (!Array.isArray(messages)) return { valid: true };
  const issued = new Set<string>();
  const completed = new Set<string>();
  for (const message of messages) {
    if (typeof message !== "object" || message === null) continue;
    const record = message as Record<string, unknown>;
    if (record.role === "assistant" && Array.isArray(record.tool_calls)) {
      for (const call of record.tool_calls) {
        if (typeof call !== "object" || call === null || typeof (call as Record<string, unknown>).id !== "string" || !(call as Record<string, unknown>).id) {
          return { valid: false, reason: "quality-tool-missing-call-id" };
        }
        issued.add((call as Record<string, unknown>).id as string);
      }
    }
    if (record.role === "tool") {
      const valid = validateReferencedToolIds(issued, completed, [record]);
      if (!valid.valid) return valid;
    }
  }
  if ([...issued].some((callId) => !completed.has(callId))) return { valid: false, reason: "quality-tool-result-required" };
  return { valid: true };
}

/** Validate tool-result references embedded in one Anthropic Messages transcript. */
export function validateAnthropicToolContinuation(messages: unknown): ToolContinuationValidation {
  if (!Array.isArray(messages)) return { valid: true };
  const issued = new Set<string>();
  const completed = new Set<string>();
  for (const message of messages) {
    if (typeof message !== "object" || message === null) continue;
    const record = message as Record<string, unknown>;
    const content = record.content;
    if (!Array.isArray(content)) continue;
    const toolUses = content.filter((block) => typeof block === "object" && block !== null && (block as Record<string, unknown>).type === "tool_use");
    for (const toolUse of toolUses) {
      const id = (toolUse as Record<string, unknown>).id;
      if (typeof id !== "string" || !id) return { valid: false, reason: "quality-tool-missing-call-id" };
      issued.add(id);
    }
    const toolResults = content.filter((block) => typeof block === "object" && block !== null && (block as Record<string, unknown>).type === "tool_result");
    const valid = validateReferencedToolIds(issued, completed, toolResults);
    if (!valid.valid) return valid;
  }
  if ([...issued].some((callId) => !completed.has(callId))) return { valid: false, reason: "quality-tool-result-required" };
  return { valid: true };
}

function safeId(): string {
  return "st_" + createHash("sha256").update(Date.now() + "-" + Math.random()).digest("hex").slice(0, 12);
}

export function shapeResponsesResponse(input: { model: string; status: "completed" | "failed" | "incomplete" | "cancelled"; output?: Array<Record<string, unknown>> }): ResponsesResponse {
  return { id: safeId(), object: "response", status: input.status, model: input.model, output: input.output ?? [], usage: input.status === "completed" ? { input_tokens: 0, output_tokens: 0, total_tokens: 0 } : undefined };
}

export function shapeChatCompletionResponse(input: { model: string; finishReason: "stop" | "length" | "tool_calls" | "content_filter" | null; content?: string | null; toolCalls?: Array<Record<string, unknown>> }): ChatCompletionResponse {
  return { id: "chatcmpl-" + safeId(), object: "chat.completion", model: input.model, choices: [{ index: 0, message: { role: "assistant", content: input.content ?? null, ...(input.toolCalls ? { tool_calls: input.toolCalls } : {}) }, finish_reason: input.finishReason }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
}

export function shapeAnthropicMessageResponse(input: { model: string; stopReason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null; content: Array<Record<string, unknown>> }): AnthropicMessageResponse {
  return { id: "msg_" + safeId(), type: "message", model: input.model, role: "assistant", content: input.content, stop_reason: input.stopReason, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } };
}

export type TerminalState = "completed" | "incomplete" | "failed" | "cancelled";

export function terminalState(event: { type: string }, token?: CancellationToken): TerminalState {
  if (token?.cancelled || event.type === "request.cancelled") return "cancelled";
  if (event.type === "response.completed") return "completed";
  if (event.type === "response.incomplete") return "incomplete";
  if (event.type === "response.failed" || event.type.endsWith(".failed")) return "failed";
  if (event.type === "message_stop" || event.type === "[DONE]") return "completed";
  return "incomplete";
}

export function classifyResponsesSseFrame(frame: { event?: string; data: string }): TerminalState {
  const eventType = frame.event ?? (() => { try { const p = JSON.parse(frame.data) as { type?: unknown }; return typeof p.type === "string" ? p.type : ""; } catch { return ""; } })();
  return terminalState({ type: eventType });
}

export function classifyChatSseFrame(frame: { data: string }): TerminalState {
  if (frame.data === "[DONE]") return "completed";
  try {
    const p = JSON.parse(frame.data) as { choices?: Array<{ finish_reason?: string | null }> };
    const r = p.choices?.[0]?.finish_reason;
    if (r === "stop" || r === "length" || r === "tool_calls" || r === "content_filter") return "completed";
    if (r) return "failed";
  } catch { /* not JSON */ }
  return "incomplete";
}

export function classifyAnthropicSseFrame(frame: { event?: string; data: string }): TerminalState {
  if (frame.event === "message_stop") return "completed";
  if (frame.event === "error") return "failed";
  if (frame.event === "ping") return "incomplete";
  try {
    const p = JSON.parse(frame.data) as { type?: string };
    if (p.type === "message_stop") return "completed";
  } catch { /* not JSON */ }
  return "incomplete";
}
