# SaveToken Decision Calibration Report

Date: 2026-08-10
Scope: 6 execution tasks × 2 effort levels (default + low) = 12 DeepSeek requests
Route: SaveToken → OpenCodex proxy → DeepSeek V4 Flash

## FACT

### Preflight

- OpenCodex: 200 ok, 200 ready, 27 models, `deepseek/deepseek-v4-flash` visible
- Effort confirmed: `reasoning.effort=low` passes through adapter (confirmed in Calibration-2 direct test)
- Response shaper does not preserve `reasoning.effort` in shaped response (adapter-level evidence used)

### Results (12 of 12 budget)

| Task | Effort | HTTP | Total | Reasoning | Quality | Delta |
|------|--------|------|-------|-----------|---------|-------|
| X1 extraction | default | 200 | 363 | 26 | ✅ 4/4 | — |
| X1 extraction | low | 200 | 1082 | 824 | ✅ 4/4 | **+198%** |
| X2 tool_call | default | 200 | 631 | 213 | ✅ 4/4 | — |
| X2 tool_call | low | 200 | 376 | 36 | ✅ 4/4 | **-40%** |
| X3 classification | default | 200 | 2789 | 2612 | ❌ format | — |
| X3 classification | low | 200 | 902 | 792 | ❌ D wrong | — |
| X4 transformation | default | 200 | 1156 | 867 | ❌ fence+type | — |
| X4 transformation | low | 200 | 1310 | 1105 | ❌ fence | — |
| X5 code_review | default | 200 | 993 | 692 | ✅ 4/4 | — |
| X5 code_review | low | 200 | 925 | 681 | ✅ 4/4 | -7% |
| X6 test_design | default | 200 | 1181 | 921 | ✅ 4/4 | — |
| X6 test_design | low | 200 | 448 | 274 | ✅ 4/4 | **-62%** |

### Quality failures (immediate disqualification)

- **X3 (classification)**: Both effort levels fail deep equality. Default outputs object format `{A:keep,...}` instead of array `[{id,label},...]`. Low additionally misclassifies D as "reject" (should be "review": paid=9 < 10).
- **X4 (transformation)**: Default outputs `active:"yes"/"no"` strings instead of booleans. Both levels wrap output in ```json``` code fence. Deep equality fails for both.

### Token delta by task (quality-passing only)

| Task | Default | Low | Delta | Recommend Low? |
|------|---------|-----|-------|----------------|
| X1 | 363 | 1082 | +198% | **No** — low is much worse |
| X2 | 631 | 376 | -40% | Yes — low saves 40% |
| X5 | 993 | 925 | -7% | **No** — below 10% threshold |
| X6 | 1181 | 448 | -62% | Yes — low saves 62% |

### Effort readback

`effortReadback: "UNKNOWN"` in all shaped responses. The response shaper (`shapeResponsesResponse`) does not include the `reasoning` field. However, the adapter-level response (confirmed in Calibration-2) correctly returns `"reasoning":{"effort":"low"}`. This is a known gap in the protocol shaper, not a routing or provider issue.

### Quality gates

| Gate | Result |
|------|--------|
| typecheck | exit 0 |
| test | 113 pass, 0 fail |
| lint | clean |
| privacy:scan | clean (0 hits) |
| package:check | pass |

## INFERENCE

1. **Low effort is NOT universally better.** X1 shows low effort increased tokens by 198% despite passing quality. X5 shows only -7% (below threshold).
2. **Low effort helps tool_call and test_design tasks.** X2 (-40%) and X6 (-62%) show significant savings with all quality criteria met.
3. **Two task classes have quality issues regardless of effort.** Classification (X3) and transformation (X4) fail for DeepSeek V4 Flash — the model does not reliably follow exact output format constraints. These task types should not be routed to DeepSeek execution without format enforcement.
4. **Class-level recommendations require 2+ tasks per class.** With 1 task per class, all class generalizations are UNKNOWN per the plan's decision rules.
5. **Per-task observation**: 2 of 6 tasks benefit from low effort; 2 of 6 are harmed by low effort; 2 of 6 fail quality for DeepSeek entirely.

## UNKNOWN

- Whether the response shaper should preserve `reasoning.effort`
- Class-level generalization (only 1 task per class)
- Whether `high` or `max` effort would change results for extraction/classification tasks
- How these results generalize to other DeepSeek models (v4-pro) or other providers

## Decision: PARTIAL

- 4 of 6 task pairs have confirmed identities and usage
- 2 task types (classification, transformation) fail quality for DeepSeek execution
- 2 tasks show low-effort benefit; 2 show low-effort harm or negligible effect
- Effort readback is UNKNOWN in the shaped response (known shaper gap)
- No class meets the "2+ tasks, all quality pass, median -10%" threshold for class-level recommendation

**Final recommendation**: Keep the current default effort. Do not apply any task-specific effort override without further per-class calibration (2+ tasks per class minimum). For tasks requiring strict output format compliance (classification, transformation), DeepSeek V4 Flash is not suitable as-is — a format enforcement layer or different model may be needed.

## Deliverables

| File | SHA-256 |
|------|---------|
| `savetoken-decision-calibration-fixtures-2026-08-10.json` | `AEBFD8863F9A61801596B74EDD2F819A2DFBDF27C4698B49F5B1AC5CB2DD2C5C` |
| `savetoken-decision-calibration-run-2026-08-10.json` | `27BCACD44915CABFC3E1F0E785256848735CB3CA49142A64B26CFAD6317D0448` |
| `savetoken-decision-calibration-report-2026-08-10.md` | (this file) |