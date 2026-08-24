# SaveToken Quality/Token Benchmark Instrument v2 — R1–R5 Report

Date: 2026-08-24  
Overall status: `PARTIAL`  
Instrument repair/freeze: `PRESENT` (local evidence)  
DeepSeek rerun: `NOT_TESTED`

## FACT

### R1 — Capability, not placeholder literals

- `SCH-05` no longer compares against `alpha`, `7`, or any other chosen value.
- It requires a parseable JSON object with exactly `name`, `count`, and `active`, with types string, integer, and boolean.
- The held-out peer `SCH-17` applies the same principle to independent fields.

### R2 — Presentation tolerance without content dilution

- JSON and structured evaluators trim whitespace and remove one outer JSON code fence before parsing.
- Entity extraction falls back to required-entity containment only when JSON parsing fails.
- Classification falls back to ordered label extraction from the frozen vocabulary only when JSON parsing fails.
- Transformation and schema tasks still require parseable JSON. Invalid types, missing fields, extra fields, wrong values for exact transformations, or malformed JSON still fail.
- This tolerance belongs only to the benchmark evaluator. Runtime Quality Gate v0.1 was not changed.

### R3 — Prompt/output alignment

- Every v2 fixture contains a non-empty `deliveryFormat` and an input that explicitly states the required output form.
- The runner sends the frozen input verbatim and never sends acceptance data to the Provider.

### R4 — Held-out category pairs

- Instrument v2 has 24 tasks: 12 categories with exactly two independent instances per category.
- The second instances use different entities, labels, tables, summaries, schemas, cities/tool results, functions, defects, test subjects, and translation content.
- Evidence now includes category-level task/pass/missing/unknown counts, pass rate, and aggregated input/output/reasoning/total usage.
- A category with any `UNKNOWN` result has an `UNKNOWN` pass rate. No category contains fewer than two tasks.

### R5 — Executable freeze

- The v1 12-task fixture was preserved unchanged for audit history.
- v2 fixtures and evaluator are frozen by an external manifest. The CLI verifies both SHA-256 values before any network request.
- A one-byte fixture change was tested and rejected with `benchmark-instrument-hash-mismatch`.
- The manifest policy forbids changing prompts, acceptance, evaluator, or held-out cases in response to any model result. A principled future revision requires a new version and must preserve v2.

## Actual validation

| Command | Exit | Actual result |
| --- | ---: | --- |
| `bun test tests/quality-token-benchmark-runner.test.ts` before R1–R5 | 1 | 1 pass, 4 fail: 12 vs 24 tasks, fence rejection, missing category aggregation |
| freeze-manifest RED test | 1 | missing `verifyFrozenBenchmarkInstrument` export |
| `bun test tests/quality-token-benchmark-runner.test.ts` final | 0 | 6 pass, 0 fail, 123 assertions |
| `bun run typecheck` | 0 | clean |
| `bun test` | 0 | 308 pass, 0 fail, 1200 assertions, 72 files |
| `bun run lint` | 0 | clean |
| `bun run privacy:scan` | 0 | 0 hits |
| `bun run package:check` | 0 | 134 allowed, 657 excluded, 0 missing |

## Frozen files and SHA-256

| SHA-256 | File |
| --- | --- |
| `50139AE5AD7829416E3D5874AFB1807E03AEB85D70DB0D47839771A96C50DA3D` | historical v1 fixture, unchanged |
| `2AFC592B93EF9BA1DE8427AD3F87EE6E541B02CB6071BDA9B4F63DD08C5E9666` | `savetoken-quality-token-benchmark-fixtures-v2-2026-08-24.json` |
| `2E7DB25AA5E684FD059FE613BEF936007E35055401DD473DB096E3E278845278` | `savetoken-quality-token-benchmark-instrument-v2-2026-08-24.json` |
| `062ECFEB251796B861ACB136BB75A7AB23231B541898CE891A4C052C96E63F8C` | `savetoken-runtime/src/benchmark/quality-token.ts` |
| `94AAE69890A10C8E5AC28B4D55B4890FBE36C5616BEB73A8BE7F4B5A0C2483EA` | `savetoken-runtime/scripts/run-deepseek-benchmark-side.ts` |
| `3E46581341E9A52B94EA4D4F2350EE62CF3BF2CEE28B911A50A5FCE3A25CCECB` | `savetoken-runtime/tests/quality-token-benchmark-runner.test.ts` |

No dependency or lockfile changed.

## INFERENCE

- v2 removes three identified sources of instrument noise: arbitrary placeholder values, harmless JSON fencing, and category conclusions based on one example.
- The remaining structured checks are task requirements, not model-specific patches: valid JSON, exact transformation content, exact keys/types, required tool identity/arguments, local function cases, and required semantic content.
- The current evidence proves instrument behavior and freeze enforcement only. It does not show that DeepSeek or Sol passes any real task.

## UNKNOWN

- DeepSeek v2 pass rates and per-category input/output/reasoning/total tokens.
- Whether any post-repair failure is model capability rather than transport/identity/usage failure until the real JSON is produced and inspected.
- Sol reachability and Sol v2 baseline.
- The comparison claim “execution tier saves tokens while preserving Sol quality.”

## Stop condition

No real request was sent. The active Codex model catalog changed after startup and model/reasoning-effort overrides remain prohibited until restart. The current instruction also requires explicit authorization for real requests. After both conditions are satisfied, run the frozen CLI exactly once for DeepSeek; do not edit v2 based on its outcome. Sol remains a separately authorized later run using the same hashes.

No commit, push, publish, deploy, production configuration change, or upstream modification was performed.
