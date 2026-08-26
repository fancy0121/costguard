export type ConversationToolState = {
  responseId: string;
  issuedCalls: Map<string, string | undefined>;
  completedCalls: Set<string>;
};

export class ConversationStore {
  private conversations = new Map<string, ConversationToolState>();

  recordIssuedCall(responseId: string, callId: string, toolName?: string): void {
    let state = this.conversations.get(responseId);
    if (!state) { state = { responseId, issuedCalls: new Map(), completedCalls: new Set() }; this.conversations.set(responseId, state); }
    state.issuedCalls.set(callId, toolName);
  }

  validateToolResultInput(previousResponseId: string | undefined, input: unknown): { valid: true } | { valid: false; reason: string } {
    if (!previousResponseId) {
      if (!Array.isArray(input)) return { valid: true };
      const unexpected = input.some((i: unknown) => typeof i === "object" && i !== null && (i as Record<string, unknown>).type === "function_call_output");
      return unexpected ? { valid: false, reason: "quality-tool-missing-previous-response" } : { valid: true };
    }
    const state = this.conversations.get(previousResponseId);
    if (!state) return { valid: false, reason: "quality-tool-unknown-conversation" };
    if (!Array.isArray(input)) return { valid: false, reason: "quality-tool-result-required" };
    const toolOutputs = input.filter((i: unknown) => typeof i === "object" && i !== null && (i as Record<string, unknown>).type === "function_call_output");
    if (toolOutputs.length === 0) return { valid: false, reason: "quality-tool-result-required" };
    const seen = new Set<string>();
    for (const item of toolOutputs) {
      const record = item as Record<string, unknown>;
      const callId = record.call_id;
      if (typeof callId !== "string" || !callId) return { valid: false, reason: "quality-tool-missing-call-id" };
      if (!state.issuedCalls.has(callId)) return { valid: false, reason: "quality-tool-unknown-call-id" };
      const issuedName = state.issuedCalls.get(callId);
      if (typeof record.name === "string" && issuedName !== undefined && record.name !== issuedName) {
        return { valid: false, reason: "quality-tool-name-mismatch" };
      }
      if (state.completedCalls.has(callId)) return { valid: false, reason: "quality-tool-duplicate-result" };
      if (seen.has(callId)) return { valid: false, reason: "quality-tool-duplicate-result" };
      seen.add(callId);
    }
    for (const callId of seen) state.completedCalls.add(callId);
    return { valid: true };
  }

  clear(): void { this.conversations.clear(); }
}
