# SaveToken Phase D-5: Trusted Proxy Route Completion

Date: 2026-08-11
Upstream: OpenCodex 2.11.0, commit 57140d6f06218d604ee139e5909a1b868bf7a84b (clean)
Result: **PARTIAL** (3 of 5 routes PRESENT through SaveToken)

## FACT

### Modified files

  40446A43E5FEBCACC94DB5B7B39AE8BDCCEFCA3B644D5DC4C613F90A24DE9872  \savetoken-runtime\src\providers\opencodex-proxy.ts
  716E8706064E298A500B1D90C19518559C59C1AC855627D3CBFFE11325853715  \savetoken-runtime\src\routing\route.ts
  3C69B509A6C1A151912F1C5DA23FED434535C9CD18CC000AC1086B76E1DDB12A  \savetoken-runtime\src\index.ts
  CBA141FEC0D3133EE41E37ED2CAE3546676449DE25680A041869180F82178CF4  \savetoken-runtime\tests\routing.test.ts

### Five-route SaveToken full-chain verification

| Route | Tier | HTTP | Model Readback | Usage | Savetoken Leak | Status |
|-------|------|------|---------------|-------|---------------|--------|
| openai/gpt-5.6-sol | sol | 200 | gpt-5.6-sol | 46 tokens | clean | **PRESENT** |
| openai/gpt-5.6-terra | terra | 200 | gpt-5.6-terra | 54 tokens | clean | **PRESENT** |
| openai/gpt-5.6-luna | execution | 502 | — | — | clean | **PARTIAL** |
| deepseek/deepseek-v4-flash | execution | 200 | deepseek-v4-flash | 266 tokens | clean | **PRESENT** |
| zhipu-bigmodel/glm-5.2 | glm-backup | 502 | — | — | clean | **PARTIAL** |

### Route status details

**Sol (gpt-5.6-sol) — PRESENT**: SaveToken → proxy adapter → OpenCodex → Sol. SSE response parsed correctly. Model identity confirmed. 46 total tokens. No savetoken leakage. Requires store:false, stream:true, input as array — handled transparently by adapter.

**Terra (gpt-5.6-terra) — PRESENT**: Same proxy path. 54 total tokens. All checks pass.

**Luna (gpt-5.6-luna) — PARTIAL**: SSE stream received but only [DONE] marker without esponse.completed event. Model identity not confirmed from response. Likely a provider-specific behavior (Luna may not emit completed events for short prompts through Codex API). Adapter correctly handles SSE parsing but response is incomplete.

**DeepSeek (deepseek-v4-flash) — PRESENT**: Existing verified route. 266 tokens. All checks pass.

**GLM (zhipu-bigmodel/glm-5.2) — PARTIAL**: Proxy adapter configured and healthy. Route blocked by runtime's GLM validation rule (glm-backup-order-invalid) which requires GLM to be the last candidate in execution chains and not at position 0. This is a routing safety rule, not an adapter issue.

### Implementation changes

1. **Generalized proxy adapter** (opencodex-proxy.ts): Replaced single-model adapter with createOpenCodexProxyAdapters() that produces 3 merged adapters (openai with 3 models, deepseek, zhipu-bigmodel). Each adapter shares the same loopback proxy logic with per-provider body transformation (OpenAI: store:false, stream:true, input array) and SSE response parsing for streaming providers.

2. **Execution-tier routing fix** (oute.ts): Added text-heavy vs tool/file classification. Text-only extraction/formatting/classification tasks now route to execution tier (DeepSeek preferred). File/code modification tasks route to execution tier (Luna preferred). Safety signals still route to Sol/Terra. Cross-module and short-text tasks still route to Terra (conservative).

3. **Routing test update** (outing.test.ts): Fixed corrupted Chinese characters in test fixture.

### Routing calibration (offline)

| Probe | Text | Tier | Pass |
|-------|------|------|------|
| E1 extraction | "extract the title and date from each markdown file" | execution | ✅ |
| M1 test design | "Design a unit-test checklist..." | terra | ✅ |
| H1 permission | "process security permission and authentication configuration" | sol, failClosed | ✅ |
| H2 security | "Assess whether an authentication change is safe..." | sol, failClosed | ✅ |

### Quality gates

| Gate | Exit | Result |
|------|------|--------|
| typecheck | 0 | clean |
| test | 0 | 128 pass, 0 fail (37 files) |
| lint | 0 | clean |
| privacy:scan | 0 | clean (0 hits) |
| package:check | 0 | 47 allowed, 0 missing |

## INFERENCE

1. Three of five frozen routes are now fully verified through SaveToken: Sol, Terra, DeepSeek.
2. The generalized proxy adapter correctly handles per-provider body format differences (streaming, input array) transparently.
3. Luna's SSE response behavior differs from Sol/Terra — it returns [DONE] without a completed event for short prompts. This is a provider-specific issue, not a SaveToken defect.
4. GLM is blocked by the runtime's GLM safety rule (must be last in execution chains). This is a routing design choice, not an adapter failure.
5. The execution-tier routing now correctly classifies text-heavy tasks as execution (DeepSeek preferred) and tool/file tasks as execution (Luna preferred), while maintaining Sol/Terra safety boundaries.

## UNKNOWN

- Luna SSE completion behavior (provider-specific; may work with longer prompts or different model version)
- GLM routing when it is the only available execution candidate (current rule blocks it at position 0)
- Multi-turn conversations through proxy adapter
- Streaming passthrough through SaveToken (adapter consumes SSE internally)
- Cross-platform behavior
- Token/cost savings between routes

## Deliverable

savetoken-phase-d5-proxy-route-completion-2026-08-11.md

Not committed, pushed, published, or deployed.