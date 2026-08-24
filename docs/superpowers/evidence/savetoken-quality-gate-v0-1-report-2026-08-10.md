# SaveToken Quality Gate v0.1 Report

Date: 2026-08-10
Stage: Quality Gate v0.1
Result: **PASS**

## FACT

### Implementation

Four files modified/created:

| File | SHA-256 | Change |
|------|---------|--------|
| `src/types.ts` | `B9489779...` | Added `StructuredQualityContract` type |
| `src/server/quality.ts` | `780338F7...` | New: bounded JSON schema validator + contract extractor |
| `src/server/runtime.ts` | `5D5B75FE...` | Quality gate enforcement after provider dispatch |
| `tests/quality-gate-stage4.test.ts` | `1630677C...` | New: 15 focused tests |

### Quality gate behavior

- **Explicit contract provided**: validates provider output against schema. Failures return HTTP 422 with `failClosed: true` and `routeAdmission` preserved.
- **No contract**: returns provider result unchanged (UNSPECIFIED quality).
- **Unsupported schema**: fail-closed.

### Validator supports (JSON Schema subset)

`type`: object, array, string, number, integer, boolean, null
`properties`, `required`, `additionalProperties: false`
`items` (array)
`enum` (scalar)

### Detected and rejected patterns

- Object vs array mismatch (X3 failure)
- String "yes"/"no" vs boolean (X4 failure)
- Code fences (```json ... ```)
- Tool name mismatch
- Tool argument type mismatch
- Invalid JSON
- Enum value mismatch

### Quality gates

| Gate | Result |
|------|--------|
| typecheck | exit 0 |
| test | **128 pass, 0 fail** (37 files) |
| lint | clean |
| privacy:scan | clean (0 hits) |
| package:check | 46 allowed, 0 missing |
| upstream | unchanged (read-only) |

### Contract extraction sources

- Responses `text.format.type = "json_schema"` with string schema
- Responses `text.format.type = "json_object"`
- Chat `response_format.type = "json_schema"` with schema
- Chat `response_format.type = "json_object"`
- First function tool definition in `tools[]`

### Preserved metadata

- `reasoning.effort` passed through in Responses responses
- `usage` (actual token counts)
- `routeAdmission` on quality failures
- Prompt content, paths, credentials never included in rejection reasons

### Regressions

- All existing 113 tests continue to pass
- Existing protocol tests, runtime smoke tests, proxy adapter tests unaffected
- No real provider calls were made for quality gate validation
- Calibration fixture regression tests not executed (no new provider calls authorized)

## INFERENCE

1. X3 (classification) and X4 (transformation) failures from Decision Calibration are now explicitly caught when a schema contract is provided.
2. The quality gate is opt-in: callers must provide a schema contract to enable validation. Without one, behavior is unchanged.
3. Code fence rejection prevents JSON wrapped in markdown from being accepted as valid structured output.
4. Tool call validation ensures function name and argument types match expectations.

## UNKNOWN

- Whether DeepSeek would produce valid output for X3/X4 if given the schema contract in the prompt (not tested)
- Performance impact on high-volume requests (no benchmarks)
- Behavior with complex nested schemas beyond the supported subset
- Whether Sol/Terra models would pass the same quality checks (no Sol adapter)

## Policy statement

- Default reasoning effort: unchanged
- Frozen tier hierarchy: unchanged (Sol/Terra/DeepSeek-Luna/GLM)
- No new Provider, adapter, auth mode, or fallback added
- OpenCodex parity: not claimed as complete
- DeepSeek classification/transformation failures: evidence for quality gate, not universal model verdict

## Deliverable

[savetoken-quality-gate-v0-1-report-2026-08-10.md](C:\Users\ASUS\Documents\Codex\2026-08-08\codex-sol-luna-max-token-10\docs\superpowers\evidence\savetoken-quality-gate-v0-1-report-2026-08-10.md)