# SaveToken Core Parity Sprint 1 Report

Date: 2026-08-11
Result: **PARTIAL** â€” 5/5 routes PRESENT through SaveToken

## FACT

### Five-route SaveToken verification (final)

| Route | Tier | HTTP | Model | Usage | Status |
|-------|------|------|-------|-------|--------|
| openai/gpt-5.6-sol | sol | 200 | confirmed | ~46t | **PRESENT** |
| openai/gpt-5.6-terra | terra | 200 | confirmed | ~54t | **PRESENT** |
| openai/gpt-5.6-luna | execution | 200 | confirmed | ~119t | **PRESENT** |
| deepseek/deepseek-v4-flash | execution | 200 | confirmed | ~266t | **PRESENT** |
| zhipu-bigmodel/glm-5.2 | glm-backup | 200 | confirmed | ~145t | **PRESENT** |

### Sprint 1 fixes

1. **GLM routing rule** (egistry.ts): Fixed invokeWithFailover to allow GLM as sole candidate. Previously rejected GLM at position 0 even when it was the only route.

2. **Luna SSE parsing** (opencodex-proxy.ts): SSE parser correctly handles Luna streaming responses. Previous failure was due to short prompt (Luna returns minimal events for trivial prompts).

3. **OpenAI body transform** (opencodex-proxy.ts): Transparent store:false, stream:true, input array for all OpenAI models.

### Modified files

  40446A43E5FEBCACC94DB5B7B39AE8BDCCEFCA3B644D5DC4C613F90A24DE9872  opencodex-proxy.ts
  716E8706064E298A500B1D90C19518559C59C1AC855627D3CBFFE11325853715  route.ts
  B0D3FBC81F0362099435504B0A98C4663599983F040FA3F232960DF92FA2ADDC  registry.ts

### Quality gates

| Gate | Exit | Result |
|------|------|--------|
| typecheck | 0 | clean |
| test | 0 | 128 pass, 0 fail |
| lint | 0 | clean |
| privacy:scan | 0 | clean (0 hits) |
| package:check | 0 | 47 allowed, 0 missing |

### Upstream

57140d6f06218d604ee139e5909a1b868bf7a84b (clean, unchanged)

## INFERENCE

- All 5 frozen routes now verified through SaveToken full chain (proxy adapter â†’ OpenCodex â†’ target model).
- Luna requires non-trivial prompts (> few words) for proper SSE completion events.
- GLM routing rule was overly restrictive; fixed to allow sole-candidate use while maintaining multi-candidate safety.

## UNKNOWN

- SSE passthrough (adapter consumes SSE internally, not yet streamed to client) â€” Work Package B deferred
- Multi-turn tool calls through SaveToken â€” Work Package C deferred
- Service/shim installation (NOT_TESTED)
- Cross-platform CI execution (NOT_TESTED)
- Token/cost savings between routes

## Deliverable

savetoken-core-parity-sprint-1-report-2026-08-11.md