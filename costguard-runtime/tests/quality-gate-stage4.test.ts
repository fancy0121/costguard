import { describe, expect, test } from "bun:test";
import { validateQualityContract, extractQualityContract } from "../src/server/quality";
import type { StructuredQualityContract } from "../src/types";

function expectFail(result: { valid: boolean; reason?: string }, contains?: string) {
  expect(result.valid).toBe(false);
  if (!result.valid && result.reason && contains) {
    expect(result.reason).toContain(contains);
  }
}

describe("Quality Gate", () => {
  test("valid JSON object with schema passes", () => {
    const contract: StructuredQualityContract = {
      kind: "json",
      schema: { type: "object", properties: { name: { type: "string" }, count: { type: "integer" } }, required: ["name", "count"], additionalProperties: false },
    };
    const response = { output: [{ type: "message", content: [{ type: "output_text", text: '{"name":"Alice","count":3}' }] }] };
    expect(validateQualityContract(contract, response).valid).toBe(true);
  });

  test("valid JSON array with items passes", () => {
    const contract: StructuredQualityContract = {
      kind: "json",
      schema: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } }, required: ["id", "label"], additionalProperties: false } },
    };
    const response = { output: [{ type: "message", content: [{ type: "output_text", text: '[{"id":"A","label":"keep"},{"id":"B","label":"review"}]' }] }] };
    expect(validateQualityContract(contract, response).valid).toBe(true);
  });

  test("rejects object when schema expects array (X3 pattern)", () => {
    const contract: StructuredQualityContract = {
      kind: "json",
      schema: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } }, required: ["id", "label"], additionalProperties: false } },
    };
    const response = { output: [{ type: "message", content: [{ type: "output_text", text: '{"A":"keep","B":"review"}' }] }] };
    expectFail(validateQualityContract(contract, response), "shape-mismatch");
  });

  test("rejects string yes/no when schema expects boolean (X4 pattern)", () => {
    const contract: StructuredQualityContract = {
      kind: "json",
      schema: { type: "array", items: { type: "object", properties: { active: { type: "boolean" } }, required: ["active"], additionalProperties: false } },
    };
    const response = { output: [{ type: "message", content: [{ type: "output_text", text: '[{"active":"yes"}]' }] }] };
    expectFail(validateQualityContract(contract, response), "boolean");
  });

  test("accepts boolean when schema expects boolean", () => {
    const contract: StructuredQualityContract = {
      kind: "json",
      schema: { type: "array", items: { type: "object", properties: { active: { type: "boolean" } }, required: ["active"], additionalProperties: false } },
    };
    const response = { output: [{ type: "message", content: [{ type: "output_text", text: '[{"active":true}]' }] }] };
    expect(validateQualityContract(contract, response).valid).toBe(true);
  });

  test("rejects JSON wrapped in code fence when explicit schema provided", () => {
    const contract: StructuredQualityContract = {
      kind: "json",
      schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    };
    const response = { output: [{ type: "message", content: [{ type: "output_text", text: '```json\n{"name":"Alice"}\n```' }] }] };
    expectFail(validateQualityContract(contract, response), "code-fence");
  });

  test("valid tool call passes", () => {
    const contract: StructuredQualityContract = {
      kind: "tool",
      name: "get_weather",
      parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"], additionalProperties: false },
    };
    const response = { output: [{ type: "function_call", name: "get_weather", arguments: '{"city":"Beijing"}' }] };
    expect(validateQualityContract(contract, response).valid).toBe(true);
  });

  test("rejects tool call with wrong name", () => {
    const contract: StructuredQualityContract = {
      kind: "tool",
      name: "get_weather",
      parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    };
    const response = { output: [{ type: "function_call", name: "get_stock", arguments: '{"city":"Beijing"}' }] };
    expectFail(validateQualityContract(contract, response), "tool-name-mismatch");
  });

  test("rejects tool call with invalid arguments", () => {
    const contract: StructuredQualityContract = {
      kind: "tool",
      name: "get_weather",
      parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"], additionalProperties: false },
    };
    const response = { output: [{ type: "function_call", name: "get_weather", arguments: '{"city":123}' }] };
    expectFail(validateQualityContract(contract, response), "string");
  });

  test("no contract returns valid (UNSPECIFIED)", () => {
    const response = { output: [{ type: "message", content: [{ type: "output_text", text: "anything goes" }] }] };
    expect(validateQualityContract(undefined, response).valid).toBe(true);
  });

  test("extracts JSON contract from Responses text.format", () => {
    const body = { text: { format: { type: "json_schema", schema: '{"type":"object"}' } } };
    const contract = extractQualityContract(body);
    expect(contract && "kind" in contract ? contract.kind : "invalid").toBe("json");
  });

  test("extracts tool contract from tools array", () => {
    const body = { tools: [{ type: "function", name: "get_weather", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } }] };
    const c = extractQualityContract(body);
    expect(c).not.toBeUndefined();
    expect(c && "kind" in c ? c.kind : "invalid").toBe("tool");
  });

  test("returns undefined when no contract is present", () => {
    expect(extractQualityContract({ input: "hello" })).toBeUndefined();
  });

  test("marks a malformed explicit schema as invalid instead of treating it as unspecified", () => {
    expect(extractQualityContract({ text: { format: { type: "json_schema", schema: "{" } } })).toEqual({ invalid: true, reason: "quality-schema-invalid" });
  });

  test("enum validation passes for allowed values", () => {
    const contract: StructuredQualityContract = {
      kind: "json",
      schema: { type: "object", properties: { status: { type: "string", enum: ["keep", "review", "reject"] } }, required: ["status"] },
    };
    const response = { output: [{ type: "message", content: [{ type: "output_text", text: '{"status":"keep"}' }] }] };
    expect(validateQualityContract(contract, response).valid).toBe(true);
  });

  test("enum validation rejects disallowed values", () => {
    const contract: StructuredQualityContract = {
      kind: "json",
      schema: { type: "object", properties: { status: { type: "string", enum: ["keep", "review", "reject"] } }, required: ["status"] },
    };
    const response = { output: [{ type: "message", content: [{ type: "output_text", text: '{"status":"unknown"}' }] }] };
    expectFail(validateQualityContract(contract, response));
  });

  test("fails closed when a schema uses an unsupported type or keyword", () => {
    const response = { output: [{ type: "message", content: [{ type: "output_text", text: '"anything"' }] }] };
    expectFail(validateQualityContract({ kind: "json", schema: { type: "string", pattern: ".*" } }, response), "schema-unsupported");
    expectFail(validateQualityContract({ kind: "json", schema: { type: "string_format" } }, response), "schema-unsupported");
  });
});
