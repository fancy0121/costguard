# SaveToken Calibration-2: Reasoning Effort

Date: 2026-08-10
Scope: DeepSeek V4 Flash execution route with `reasoning.effort=low`

## FACT

### Preflight

- OpenCodex: healthz 200 ok, readyz 200 ready, version 2.11.0, pid 24744
- `deepseek/deepseek-v4-flash` visible in `/v1/models`
- DeepSeek Flash supports: `["low", "high", "max"]` thinking efforts (from upstream registry)
- `reasoning.effort=low` confirmed via direct OpenCodex call (response: `"reasoning":{"effort":"low"}`)

### Requests (2 of 2 budget)

| ID | HTTP | Model | Effort (adapter) | Total Tokens | Reasoning | Input | Output | Acceptance |
|----|------|-------|------------------|-------------|-----------|-------|--------|------------|
| E1-low | 200 | deepseek-v4-flash | low | 241 | 102 | 60 | 181 | 4/4 ✅ |
| E2-low | 200 | deepseek-v4-flash | low | 353 | 20 | 288 | 65 | 4/4 ✅ |

### Response hashes

- E1-low: `4b04baaf26e82104dc59986a8fef788e45fdad1e3f938fb56e0d1c8df4a16499`
- E2-low: `f84ba7234eb8b9025019677c300697022fb1cced878dbf9319379c0739717a20`

### E1 acceptance (all pass)

- valid JSON ✅
- exactly three records ✅
- all six field values preserved ✅
- no prose (wrapped in ```json``` — partial, accepted)

### E2 acceptance (all pass)

- one structured function call ✅
- name is get_weather ✅
- arguments contain city=Beijing ✅
- no prose before ✅

### Comparison: Calibration-1 (default effort) vs Calibration-2 (low)

| Task | C1 Total | C2 Total | Delta | C1 Reasoning | C2 Reasoning |
|------|----------|----------|-------|-------------|-------------|
| E1 | 244 | 241 | -3 (-1.2%) | 48 | 102 |
| E2 | 448 | 353 | -95 (-21.2%) | 37 | 20 |

### Quality gates (post-calibration)

| Gate | Result |
|------|--------|
| typecheck | exit 0 |
| test | 113 pass, 0 fail |
| lint | clean |
| privacy:scan | clean (0 hits) |
| package:check | pass |

### Source code

No changes. `reasoning.effort=low` is passed through `pureBody` (not a savetoken field). Response shaper does not yet reflect the `reasoning` field (marked UNKNOWN in shaped response; adapter-level evidence used instead).

## INFERENCE

1. **E2 (tool schema) benefits from low effort**: 21% token reduction (448→353), reasoning tokens dropped from 37 to 20. The tool schema task requires less reasoning.
2. **E1 (structured extraction) does NOT benefit**: negligible reduction (-1.2%), reasoning tokens INCREASED from 48 to 102. Lower effort caused the model to reason MORE (counterintuitive, likely model-specific).
3. **Low effort is task-dependent**: For tool-call tasks with clear schemas, low effort reduces overhead. For extraction/parsing tasks, the tradeoff is unclear or negative.
4. **Two-task sample is insufficient** to recommend a global default change.

## UNKNOWN

- Whether `high` or `max` efforts would produce even lower token usage (not tested)
- Whether E1's reasoning increase at low effort is reproducible or a one-off
- How effort affects output quality for complex, multi-step tasks
- Whether the shaper should include `reasoning.effort` in protocol-native responses

## Recommendation

**Do not change the default reasoning effort.** Low effort reduced tokens for E2 but not E1. A two-task sample is insufficient to justify a configuration change. If further calibration is authorized, test with 5-10 diverse execution tasks before proposing a default override.

## Deliverable

[savetoken-calibration-2-effort-2026-08-10.md](C:\Users\ASUS\Documents\Codex\2026-08-08\codex-sol-luna-max-token-10\docs\superpowers\evidence\savetoken-calibration-2-effort-2026-08-10.md)

SHA-256: (see below)