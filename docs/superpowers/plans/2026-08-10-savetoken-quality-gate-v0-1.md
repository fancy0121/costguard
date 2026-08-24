# SaveToken Quality Gate v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this plan as one bounded task. Do not add providers, change the routing hierarchy, or perform another broad calibration.

**Goal:** Prevent malformed structured outputs and invalid tool arguments from being accepted as successful DeepSeek execution results while preserving the current default effort and SaveToken hierarchy.

**Architecture:** Add a dependency-free, explicit-contract quality gate at the SaveToken protocol boundary. The gate runs only when the caller supplies a machine-checkable JSON format/schema or tool schema; it never guesses strictness from natural-language prompts. Invalid or unsupported contracts fail closed with redacted evidence. Preserve only safe `reasoning.effort` metadata for audit; do not expose hidden reasoning content. The existing DeepSeek proxy adapter and routing policy remain unchanged.

**Tech Stack:** Existing Bun/TypeScript runtime, OpenAI Responses/Chat request shapes, JSON schema subset validator, current ProviderAdapter response objects, and existing privacy/package gates.

## Global Constraints

- Keep the frozen tier hierarchy: Sol highest-risk, Terra medium, Luna/DeepSeek execution, GLM last low-risk backup.
- Keep the current global reasoning effort; do not add a task-specific override in this task.
- Do not add a Provider, adapter, auth mode, fallback chain, service, GUI, or catalog feature.
- Do not read, print, copy, or persist API keys, OAuth state, cookies, browser state, private paths, or real user data.
- Do not silently retry or downgrade a quality-contract failure.
- Do not modify `work/opencodex-upstream`.
- No new dependency; use existing TypeScript/Bun facilities.
- If an input contract is absent, the runtime must not claim strict structured-output quality; it may return the provider result with `qualityEvidence: "UNSPECIFIED"` or preserve the existing response behavior.

---

### Task 1: Map the existing protocol and response boundaries

**Files:**
- Read: `savetoken-runtime/src/server/protocol.ts`
- Read: `savetoken-runtime/src/server/runtime.ts`
- Read: `savetoken-runtime/src/providers/opencodex-proxy.ts`
- Read: `savetoken-runtime/src/types.ts`
- Read: `savetoken-runtime/tests/protocol-runtime-contract-stage3.test.ts`
- Read: `savetoken-runtime/tests/opencodex-proxy-stage3.test.ts`
- Read: `docs/superpowers/evidence/savetoken-decision-calibration-report-2026-08-10.md`

**Interfaces:**
- Consumes: current Responses parsing, provider response extraction, and the X3/X4 failure evidence.
- Produces: a written field map before implementation; no code changes in this task step.

- [ ] Identify where Responses `text.format` or Chat `response_format` is currently preserved or dropped.
- [ ] Identify where tool schemas are forwarded and where function-call arguments become a response.
- [ ] Identify the exact runtime response object that contains `output`, `usage`, and `reasoning.effort`.
- [ ] Confirm that the quality gate can inspect provider output before `shapeResponsesResponse` returns HTTP 200.
- [ ] If the field map cannot be established from source, stop with UNKNOWN; do not invent a wire shape.

Expected result: exact source locations and field names for request contract, provider output, response shaping, and evidence.

### Task 2: Add the minimal explicit quality contract type

**Files:**
- Modify: `savetoken-runtime/src/types.ts`
- Modify: `savetoken-runtime/src/server/protocol.ts`
- Test: `savetoken-runtime/tests/protocol.test.ts`

**Interfaces:**
- Consumes: existing `NormalizedRequest` and protocol request bodies.
- Produces: an optional explicit contract with no prompt-text heuristics.

Use these exact shapes:

```ts
export type StructuredQualityContract = {
  kind: "json";
  schema: Record<string, unknown>;
} | {
  kind: "tool";
  name: string;
  parameters: Record<string, unknown>;
};
```

- [ ] Extract a JSON contract only from the existing Responses `text.format` JSON-schema shape or Chat `response_format` JSON-schema shape found in the source map.
- [ ] Extract a tool contract only from an explicit function tool definition; do not infer a contract from prose such as “return JSON”.
- [ ] Preserve the original provider body unchanged in `pureBody`; the contract is metadata for validation, not a new `savetoken*` field.
- [ ] Reject malformed contract objects with a typed validation reason before provider dispatch.
- [ ] Add tests for: valid JSON schema extraction, valid tool schema extraction, malformed schema rejection, and no-contract `UNSPECIFIED` state.

Expected result: callers can explicitly request a checkable contract without changing existing provider wire fields.

### Task 3: Implement a bounded dependency-free validator

**Files:**
- Create: `savetoken-runtime/src/server/quality.ts`
- Test: `savetoken-runtime/tests/quality-gate-stage4.test.ts`

**Interfaces:**
- Consumes:

```ts
validateQualityContract(
  contract: StructuredQualityContract,
  response: unknown,
): { valid: true } | { valid: false; reason: string };
```

- Produces: redacted, deterministic quality verdicts.

Support only this JSON-schema subset and fail closed for anything else:

- `type`: `object`, `array`, `string`, `number`, `integer`, `boolean`, `null`;
- object `properties`, `required`, `additionalProperties: false`;
- array `items`;
- scalar `enum`.

- [ ] Extract response text only from known Responses output-text content items; reject missing or multiple ambiguous payloads.
- [ ] Reject Markdown code fences when a JSON contract is explicit; do not silently strip them.
- [ ] Parse JSON and validate the supported schema subset recursively.
- [ ] For tool contracts, require exactly one matching function call and validate its JSON arguments against `parameters`.
- [ ] Return stable reasons such as `quality-json-invalid`, `quality-schema-unsupported`, `quality-shape-mismatch`, `quality-tool-name-mismatch`, and `quality-tool-arguments-invalid`.
- [ ] Never include provider output, prompts, paths, stack traces, or secrets in the reason.
- [ ] Add tests for the two observed failures: object-vs-array mismatch and string `yes/no` vs boolean, plus valid JSON and valid tool arguments.

Expected result: X3/X4-style malformed results are rejected instead of being returned as successful strict outputs.

### Task 4: Enforce the gate and preserve safe effort evidence

**Files:**
- Modify: `savetoken-runtime/src/server/runtime.ts`
- Modify: `savetoken-runtime/src/server/protocol.ts`
- Modify: `savetoken-runtime/src/types.ts`
- Test: `savetoken-runtime/tests/protocol-runtime-contract-stage3.test.ts`
- Test: `savetoken-runtime/tests/runtime-smoke.test.ts`

**Interfaces:**
- Consumes: `validateQualityContract`, normalized contract metadata, and provider response objects.
- Produces: protocol-native responses with safe quality/effort evidence.

- [ ] Run the quality validator after a `PRESENT` provider result and before returning HTTP 200.
- [ ] When an explicit contract fails, return HTTP 422 with `{status:"UNKNOWN", failClosed:true, reason:<stable-quality-reason>, routeAdmission}`; do not retry or silently fall back.
- [ ] When no explicit contract exists, preserve existing behavior and attach `qualityEvidence: "UNSPECIFIED"` only if the response shape already permits it; do not claim validation.
- [ ] Preserve only `reasoning.effort` as an optional safe metadata field; do not expose reasoning text or hidden chain content.
- [ ] Keep actual usage fields unchanged and redacted.
- [ ] Test valid structured output, invalid structured output, invalid tool arguments, no-contract output, route evidence on quality failure, and safe effort readback.

Expected result: quality failures become explicit fail-closed results; valid outputs retain protocol compatibility and measurable usage.

### Task 5: Freeze the provisional routing policy and evidence

**Files:**
- Create: `docs/superpowers/evidence/savetoken-quality-gate-v0-1-report-2026-08-10.md`
- Optional modify: `SAVETOKEN_SPEC.md` only if the exact wording is already compatible with the frozen contract.

**Interfaces:**
- Consumes: quality tests, existing calibration reports, and final gate output.
- Produces: a bounded policy statement; no global effort change.

The report must state:

- default reasoning effort remains unchanged;
- low effort is not globally recommended;
- explicit structured contracts are validated;
- no-contract strict-output quality is `UNSPECIFIED`, not guaranteed;
- DeepSeek classification/transformation failures are evidence for the quality gate, not a universal model verdict;
- no new Provider, Sol adapter, GLM fallback, or broad parity claim was added.

- [ ] Run the existing calibration fixtures through the local validator as regression evidence; do not send additional real provider requests.
- [ ] Record FACT, INFERENCE, UNKNOWN, modified files, and hashes.
- [ ] Do not mark the overall OpenCodex parity matrix as complete.

### Task 6: Run final verification and deliver once

**Files:**
- Verify: `savetoken-runtime/`
- Verify: all new evidence files

- [ ] Run `bun run typecheck`.
- [ ] Run `bun test`.
- [ ] Run `bun run lint`.
- [ ] Run `bun run privacy:scan`.
- [ ] Run `bun run package:check`.
- [ ] Confirm `work/opencodex-upstream` remains clean and unchanged.
- [ ] Hash every modified source/test/evidence file.
- [ ] Return one final report with `PASS | PARTIAL | BLOCKED`, not intermediate acceptance requests.

## Acceptance gate

PASS only if:

- all existing tests plus the quality-gate tests pass;
- the two observed malformed-output patterns are rejected;
- valid structured output and valid tool calls pass;
- effort metadata is preserved without hidden reasoning text;
- default effort and frozen tier hierarchy remain unchanged;
- privacy/package/upstream checks pass.

If any condition fails, report `PARTIAL` or `BLOCKED`; do not lower the quality gate or claim token savings.

## Non-goals

- No additional real-model calibration requests.
- No automatic Terra/Sol retry after quality failure.
- No model-specific denylist based solely on one synthetic task.
- No global or task-specific reasoning-effort override.
- No claim that this completes OpenCodex parity or replaces ChatGPT Pro.
