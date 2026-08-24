# SaveToken Calibration-1 Report

Date: 2026-08-10
Stage: Calibration-1
Result: **PARTIAL**

## FACT

### Fixtures

- SHA-256: `26005BCD34486F3EA598C58033B0FD50B7A666F9FD62579FA6518BA230D4AE77`
- 6 probes: E1, E2 (execution), M1, M2 (medium routing), H1, H2 (high routing)
- No secrets, credentials, paths, or production data in fixtures

### Real requests (4 of 4 budget)

| ID | Route | Model | HTTP | Usage (total) | Acceptance |
|----|-------|-------|------|---------------|------------|
| E1-DS | SaveToken→DeepSeek | deepseek-v4-flash | 200 | 244 | ✅ all 4 criteria |
| E2-DS | SaveToken→DeepSeek | deepseek-v4-flash | 200 | 448 | ✅ all 4 criteria |
| E1-SOL | OpenCodex→Sol | gpt-5.6-sol | 200 | 157 | ✅ all 4 criteria |
| E2-SOL | OpenCodex→Sol | gpt-5.6-sol | 200 | 74 | ✅ all 4 criteria |

### Model identities confirmed

- DeepSeek: `deepseek-v4-flash` (SaveToken adds provider prefix)
- Sol: `gpt-5.6-sol`
- All models match requested IDs

### Token comparison (identical prompts)

| Task | DeepSeek | Sol | Ratio |
|------|----------|-----|-------|
| E1 (structured extraction) | 244 | 157 | 1.55× |
| E2 (tool schema) | 448 | 74 | 6.05× |

DeepSeek used MORE tokens than Sol in both tasks. Reasoning overhead (48 tokens in E1, 37 in E2) and tool schema inflation contributed to higher DeepSeek counts.

### Routing calibration (offline, 4 of 4)

| Probe | Expected | Actual | failClosed | Pass |
|-------|----------|--------|------------|------|
| M1 (test design) | terra | terra | true | ✅ |
| M2 (cross-file map) | terra | terra | true | ✅ |
| H1 (permission) | sol | sol | true | ✅ |
| H2 (security) | sol | sol | true | ✅ |

### Sol invocation note

Sol required non-standard input format: `input` as array, `store: false`, `stream: true`. This is Codex-specific and not portable to standard Responses API clients. The SaveToken runtime does not yet support this format for Sol.

### Quality gates (post-calibration)

| Gate | Result |
|------|--------|
| typecheck | exit 0 |
| test | 113 pass, 0 fail |
| lint | clean |
| privacy:scan | clean (0 hits) |
| package:check | 47 allowed, 693 excluded, 0 missing |

## INFERENCE

- SaveToken's DeepSeek execution route is fully functional and produces correct, acceptance-compliant outputs.
- Sol produces correct outputs with lower token usage for these two tasks — the reasoning overhead of DeepSeek (thinking tokens) contributes to the higher count.
- Both models satisfy all critical acceptance criteria for E1 and E2.
- The frozen routing policy correctly classifies all four probes (M1/M2→terra, H1/H2→sol with failClosed).
- This is a 2-task sample. It does not prove general quality parity, cost savings, or Sol superiority.

## UNKNOWN

- Sol integration through SaveToken runtime (no Sol adapter exists; OAuth not tested; stream-only constraints not handled)
- DeepSeek vs Sol comparison for longer, more complex tasks
- Multi-turn conversation costs
- Terra, Luna, GLM routing at runtime (offline probes only)
- Streaming and tool-call round trips through SaveToken Sol route
- Quota, rate-limit, or cooldown behavior
- Whether reasoning overhead is justified for execution-tier tool/file tasks

## Verdict: PARTIAL

DeepSeek execution route and routing policy are verified. Sol control exists but is not integrated through SaveToken (no OAuth adapter). Token comparison shows DeepSeek using MORE tokens than Sol for both tasks — the opposite of the savings goal.

A `PASS` requires:
1. Sol SaveToken adapter (OAuth) — not implemented
2. Token savings demonstrated — not shown (DeepSeek used more)
3. Multi-task sample beyond 2 tasks — not collected

## Deliverables

| File | SHA-256 |
|------|---------|
| `savetoken-calibration-fixtures-2026-08-10.json` | `26005BCD34486F3EA598C58033B0FD50B7A666F9FD62579FA6518BA230D4AE77` |
| `savetoken-calibration-run-2026-08-10.json` | `5A2CEC7954F72E19D254257CD04D5AC16A340E9C3D88DFAF73A76266626BFFF5` |
| `savetoken-calibration-report-2026-08-10.md` | (this file) |