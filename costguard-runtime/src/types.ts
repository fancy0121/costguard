export type CostGuardTier = "sol" | "terra" | "execution" | "glm-backup";

export type CostGuardTaskSignals = {
  text: string;
  filesChanged?: number;
  modulesTouched?: number;
  hasSecurityOrPermissionImpact?: boolean;
  hasProductionOrMigrationImpact?: boolean;
  isBatchOrRepetitive?: boolean;
  isToolOrFileExecution?: boolean;
  blocker?: boolean;
};

export type CostGuardRouteDecision = {
  tier: CostGuardTier;
  candidates: string[];
  escalationReasons: string[];
  failClosed: boolean;
};

export type ResponsesProtocol = "responses";
export type ChatProtocol = "chat";
export type AnthropicProtocol = "anthropic";
export type ProtocolKind = ResponsesProtocol | ChatProtocol | AnthropicProtocol;

export type ResponsesRequest = {
  model: string;
  input: string | Array<Record<string, unknown>>;
  instructions?: string;
  tools?: Array<Record<string, unknown>>;
  tool_choice?: string | Record<string, unknown>;
  costguardTask?: string;
  costguardTier?: CostGuardTier;
  costguardRoute?: string;
};

export type ChatRequest = {
  model: string;
  messages: Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
  tool_choice?: string | Record<string, unknown>;
  stream?: boolean;
  stream_options?: Record<string, unknown>;
  costguardTask?: string;
  costguardTier?: CostGuardTier;
  costguardRoute?: string;
};

export type AnthropicRequest = {
  model: string;
  max_tokens: number;
  messages: Array<Record<string, unknown>>;
  system?: string | Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
  tool_choice?: { type: string; name?: string } | { type: "auto" } | { type: "any" };
  stream?: boolean;
  costguardTask?: string;
  costguardTier?: CostGuardTier;
  costguardRoute?: string;
};

export type ProtocolRequest = ResponsesRequest | ChatRequest | AnthropicRequest;

export type ResponsesResponse = {
  id: string;
  object: "response";
  status: "completed" | "failed" | "incomplete" | "cancelled";
  model: string;
  output: Array<Record<string, unknown>>;
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
};

export type ChatCompletionResponse = {
  id: string;
  object: "chat.completion";
  model: string;
  choices: Array<{
    index: number;
    message: { role: "assistant"; content: string | null; tool_calls?: Array<Record<string, unknown>> };
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

export type AnthropicMessageResponse = {
  id: string;
  type: "message";
  model: string;
  role: "assistant";
  content: Array<Record<string, unknown>>;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
  stop_sequence: string | null;
  usage: { input_tokens: number; output_tokens: number };
};

export type RouteAdmissionEvidence = {
  decidedAt: string;
  decidingTier: CostGuardTier;
  requestedTier?: CostGuardTier;
  selectedProviderTier?: CostGuardTier;
  escalationReasons: string[];
  signalSource: "structured" | "text-inference" | "unavailable";
  taskTextHash?: string;
  logicalComboId?: string;
};

export type NormalizedRequest = {
  model: string;
  messages: Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
  protocol: ProtocolKind;
  pureBody: Record<string, unknown>;
};

export type StructuredQualityContract = {
  kind: "json";
  schema: Record<string, unknown>;
} | {
  kind: "tool";
  name: string;
  parameters: Record<string, unknown>;
} | {
  kind: "tools";
  tools: Array<{ name: string; parameters: Record<string, unknown> }>;
};
