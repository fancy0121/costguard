import type { ProtocolKind, StructuredQualityContract } from "../types";

// ── JSON Schema subset validator ────────────────────────────────────

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stripCodeFence(text: string): { cleaned: string; hadFence: boolean } {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) return { cleaned: fenceMatch[1].trim(), hadFence: true };
  if (/^```/.test(trimmed)) return { cleaned: "", hadFence: true };
  return { cleaned: trimmed, hadFence: false };
}

function validateSchema(
  schema: Record<string, unknown>,
  value: JsonValue,
  path: string
): { valid: true } | { valid: false; reason: string } {
  const type = schema.type;
  const allowedKeywords = new Set(["type", "properties", "required", "items", "enum", "additionalProperties"]);
  if (Object.keys(schema).some((key) => !allowedKeywords.has(key)) || !["object", "array", "string", "number", "integer", "boolean", "null"].includes(typeof type === "string" ? type : "")) {
    return { valid: false, reason: `quality-schema-unsupported at ${path}` };
  }

  // type check
  // Reject type mismatch for explicit type declarations
  if (type === "array" && !Array.isArray(value)) {
    return { valid: false, reason: `quality-shape-mismatch: expected array at ${path}, got ${typeof value}` };
  }
  if (type === "object" && !isRecord(value)) {
    return { valid: false, reason: `quality-shape-mismatch: expected object at ${path}, got ${typeof value}` };
  }
  if (type === "null") {
    if (value !== null) return { valid: false, reason: `quality-shape-mismatch: expected null at ${path}` };
    return { valid: true };
  }
  if (typeof type === "string" && type !== "object" && type !== "array") {
    const jsType = type === "integer" ? "number" : type;
    if (typeof value !== jsType) return { valid: false, reason: `quality-shape-mismatch: expected ${type} at ${path}, got ${typeof value}` };
  }

  // enum
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.some((e: unknown) => JSON.stringify(e) === JSON.stringify(value))) {
      return { valid: false, reason: `quality-shape-mismatch: value not in enum at ${path}` };
    }
  }

  // object
  if (type === "object" && isRecord(value)) {
    if (schema.properties !== undefined && !isRecord(schema.properties)) return { valid: false, reason: `quality-schema-unsupported at ${path}` };
    if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((item) => typeof item !== "string"))) return { valid: false, reason: `quality-schema-unsupported at ${path}` };
    if (schema.additionalProperties !== undefined && schema.additionalProperties !== false && schema.additionalProperties !== true) return { valid: false, reason: `quality-schema-unsupported at ${path}` };
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys((schema.properties as Record<string, unknown>) ?? {}));
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) return { valid: false, reason: `quality-shape-mismatch: unexpected field "${key}" at ${path}` };
      }
    }
    if (Array.isArray(schema.required)) {
      for (const req of schema.required) {
        if (!(req in value)) return { valid: false, reason: `quality-shape-mismatch: missing required field "${req}" at ${path}` };
      }
    }
    if (isRecord(schema.properties)) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in value) {
          const r = validateSchema(propSchema as Record<string, unknown>, value[key] as JsonValue, `${path}.${key}`);
          if (!r.valid) return r;
        }
      }
    }
    return { valid: true };
  }

  // array
  if (type === "array" && Array.isArray(value)) {
    if (schema.items !== undefined && !isRecord(schema.items)) return { valid: false, reason: `quality-schema-unsupported at ${path}` };
    if (isRecord(schema.items)) {
      for (let i = 0; i < value.length; i++) {
        const r = validateSchema(schema.items as Record<string, unknown>, value[i] as JsonValue, `${path}[${i}]`);
        if (!r.valid) return r;
      }
    }
    return { valid: true };
  }

  if (type === "string" && typeof value === "string") return { valid: true };
  if (type === "number" && typeof value === "number") return { valid: true };
  if (type === "integer" && typeof value === "number" && Number.isInteger(value)) return { valid: true };
  if (type === "boolean" && typeof value === "boolean") return { valid: true };

  return { valid: true };
}

// ── Extracting response text ────────────────────────────────────────

function extractResponseText(response: unknown): string | null {
  if (!isRecord(response)) return null;
  const output = response.output;
  if (!Array.isArray(output)) return null;
  const messages = output.filter((o: unknown) => isRecord(o) && (o as Record<string, unknown>).type === "message");
  if (messages.length !== 1) return null;
  const msg = messages[0] as Record<string, unknown>;
  const content = msg.content;
  if (!Array.isArray(content)) return null;
  const texts = content.filter((c: unknown) => isRecord(c) && (c as Record<string, unknown>).type === "output_text");
  if (texts.length !== 1) return null;
  return (texts[0] as Record<string, unknown>).text as string ?? null;
}

function extractFunctionCall(response: unknown): { name: string; arguments: string } | null {
  if (!isRecord(response)) return null;
  const output = response.output;
  if (!Array.isArray(output)) return null;
  const calls = output.filter((o: unknown) => isRecord(o) && (o as Record<string, unknown>).type === "function_call");
  if (calls.length !== 1) return null;
  const fc = calls[0] as Record<string, unknown>;
  if (typeof fc.name !== "string" || typeof fc.arguments !== "string") return null;
  return { name: fc.name, arguments: fc.arguments };
}

/** Normalize only the protocol-owned structured output needed by the bounded validator. */
function normalizeQualityResponse(protocol: ProtocolKind, response: unknown): unknown {
  if (protocol === "responses") return response;
  if (!isRecord(response)) return response;
  if (protocol === "chat") {
    const message = Array.isArray(response.choices) && isRecord(response.choices[0]) && isRecord((response.choices[0] as Record<string, unknown>).message)
      ? (response.choices[0] as Record<string, unknown>).message as Record<string, unknown>
      : undefined;
    if (!message) return response;
    if (typeof message.content === "string") return { output: [{ type: "message", content: [{ type: "output_text", text: message.content }] }] };
    const tool = Array.isArray(message.tool_calls) && isRecord(message.tool_calls[0]) ? message.tool_calls[0] as Record<string, unknown> : undefined;
    const functionCall = tool && isRecord(tool.function) ? tool.function as Record<string, unknown> : undefined;
    if (functionCall && typeof functionCall.name === "string" && typeof functionCall.arguments === "string") {
      return { output: [{ type: "function_call", name: functionCall.name, arguments: functionCall.arguments }] };
    }
    return response;
  }
  const block = Array.isArray(response.content) && isRecord(response.content[0]) ? response.content[0] as Record<string, unknown> : undefined;
  if (!block) return response;
  if (block.type === "text" && typeof block.text === "string") return { output: [{ type: "message", content: [{ type: "output_text", text: block.text }] }] };
  if (block.type === "tool_use" && typeof block.name === "string" && block.input !== undefined) {
    try { return { output: [{ type: "function_call", name: block.name, arguments: JSON.stringify(block.input) }] }; } catch { return response; }
  }
  return response;
}

// ── Public API ──────────────────────────────────────────────────────

export type QualityResult =
  | { valid: true }
  | { valid: false; reason: string };

export type ExtractedQualityContract = StructuredQualityContract | { invalid: true; reason: "quality-schema-invalid" } | undefined;

export function validateQualityContract(
  contract: StructuredQualityContract | undefined,
  response: unknown,
  protocol: ProtocolKind = "responses",
): QualityResult {
  if (!contract) return { valid: true };
  const normalizedResponse = normalizeQualityResponse(protocol, response);

  if (contract.kind === "json") {
    const text = extractResponseText(normalizedResponse);
    if (text === null) return { valid: false, reason: "quality-response-text-ambiguous" };

    const { cleaned, hadFence } = stripCodeFence(text);
    if (hadFence) return { valid: false, reason: "quality-code-fence-rejected" };

    let parsed: unknown;
    try { parsed = JSON.parse(cleaned); } catch { return { valid: false, reason: "quality-json-invalid" }; }

    return validateSchema(contract.schema, parsed as JsonValue, "$");
  }

  // tool contract
  const fc = extractFunctionCall(normalizedResponse);
  if (!fc) return { valid: false, reason: "quality-function-call-missing" };
  const tool = contract.kind === "tool"
    ? (fc.name === contract.name ? contract : undefined)
    : contract.tools.find((candidate) => candidate.name === fc.name);
  if (!tool) return { valid: false, reason: "quality-tool-name-mismatch" };

  let args: unknown;
  try { args = JSON.parse(fc.arguments); } catch { return { valid: false, reason: "quality-tool-arguments-invalid" }; }

  if (!isRecord(tool.parameters)) return { valid: false, reason: "quality-schema-unsupported" };
  return validateSchema(tool.parameters as Record<string, unknown>, args as JsonValue, "$");
}

// ── Contract extraction from request body ───────────────────────────

export function extractQualityContract(body: Record<string, unknown>): ExtractedQualityContract {
  // Responses text.format
  const textFormat = body.text;
  if (isRecord(textFormat) && isRecord((textFormat as Record<string, unknown>).format)) {
    const fmt = (textFormat as Record<string, unknown>).format as Record<string, unknown>;
    if (fmt.type === "json_schema" && typeof fmt.schema === "string") {
      try {
        const schema = JSON.parse(fmt.schema) as unknown;
        return isRecord(schema) ? { kind: "json", schema } : { invalid: true, reason: "quality-schema-invalid" };
      } catch { return { invalid: true, reason: "quality-schema-invalid" }; }
    }
    if (fmt.type === "json_schema" && isRecord(fmt.json_schema)) {
      const jsonSchema = fmt.json_schema as Record<string, unknown>;
      if (typeof jsonSchema.schema === "string") {
        try {
          const schema = JSON.parse(jsonSchema.schema) as unknown;
          return isRecord(schema) ? { kind: "json", schema } : { invalid: true, reason: "quality-schema-invalid" };
        } catch { return { invalid: true, reason: "quality-schema-invalid" }; }
      }
      if (isRecord(jsonSchema.schema)) return { kind: "json", schema: jsonSchema.schema };
    }
    if (fmt.type === "json_object") {
      return { kind: "json", schema: { type: "object" } };
    }
  }

  // Chat response_format
  const rf = body.response_format;
  if (isRecord(rf) && rf.type === "json_schema" && isRecord(rf.json_schema)) {
    const js = rf.json_schema as Record<string, unknown>;
    if (typeof js.schema === "string") {
      try {
        const schema = JSON.parse(js.schema) as unknown;
        return isRecord(schema) ? { kind: "json", schema } : { invalid: true, reason: "quality-schema-invalid" };
      } catch { return { invalid: true, reason: "quality-schema-invalid" }; }
    }
    if (isRecord(js.schema)) {
      return { kind: "json", schema: js.schema };
    }
    return { invalid: true, reason: "quality-schema-invalid" };
  }
  if (isRecord(rf) && rf.type === "json_object") {
    return { kind: "json", schema: { type: "object" } };
  }

  // Tool contracts: accept only known, bounded protocol-native definitions.
  const tools = body.tools;
  if (Array.isArray(tools) && tools.length > 0) {
    const contracts = tools.map((tool) => {
      if (!isRecord(tool)) return undefined;
      if (tool.type === "function" && typeof tool.name === "string" && isRecord(tool.parameters)) return { name: tool.name, parameters: tool.parameters };
      if (tool.type === "function" && isRecord(tool.function) && typeof tool.function.name === "string" && isRecord(tool.function.parameters)) return { name: tool.function.name, parameters: tool.function.parameters };
      if (typeof tool.name === "string" && isRecord(tool.input_schema)) return { name: tool.name, parameters: tool.input_schema };
      return undefined;
    });
    if (contracts.every((contract) => contract === undefined)) return undefined;
    if (contracts.some((contract) => contract === undefined) || contracts.length > 32 || new Set(contracts.map((contract) => contract?.name)).size !== contracts.length) {
      return { invalid: true, reason: "quality-schema-invalid" };
    }
    const validContracts = contracts as Array<{ name: string; parameters: Record<string, unknown> }>;
    if (validContracts.length === 1) return { kind: "tool", ...validContracts[0] };
    return { kind: "tools", tools: validContracts };
  }

  return undefined;
}
