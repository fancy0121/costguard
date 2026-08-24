# SaveToken Phase D-4: Runtime Route Matrix and Pre-Release Parity Closure

Date: 2026-08-11
Upstream: OpenCodex 2.11.0, commit 57140d6f06218d604ee139e5909a1b868bf7a84b (clean)
OpenCodex: PID 22196, port 10100, healthz 200 ok, readyz 200 ready, 27 models

## FACT

### Frozen Route Matrix (all 5 routes verified via OpenCodex)

| Tier | Model | Catalog | Reachable | Adapter | Auth | Verified |
|------|-------|---------|-----------|---------|------|----------|
| Sol | gpt-5.6-sol | VISIBLE | YES (200, 15 tokens) | NONE (OAuth req) | Codex OAuth | Catalog + direct call |
| Terra | gpt-5.6-terra | VISIBLE | YES (200) | NONE (OAuth req) | Codex OAuth | Catalog + direct call |
| Execution | gpt-5.6-luna | VISIBLE | YES (200, 15 tokens) | NONE (OAuth req) | Codex OAuth | Catalog + direct call |
| Execution | deepseek-v4-flash | VISIBLE | YES (200, 109 tokens) | proxy adapter | proxy (loopback) | Full chain: SaveToken→proxy→OpenCodex→DeepSeek |
| GLM Backup | glm-5.2 | VISIBLE | YES (200, 94 tokens) | NONE (key req) | API key | Catalog + direct call |

### SaveToken Adapter Status

| Model | Adapter | SaveToken Route | Evidence |
|-------|---------|----------------|----------|
| gpt-5.6-sol | MISSING | NOT WIRED | OAuth required; no Sol adapter implemented |
| gpt-5.6-terra | MISSING | NOT WIRED | OAuth required; no Terra adapter implemented |
| gpt-5.6-luna | MISSING | NOT WIRED | OAuth required; no Luna adapter implemented |
| deepseek-v4-flash | PRESENT (proxy) | WIRED | D-3 evidence; Calibration-1/2; Decision Calibration |
| glm-5.2 | MISSING | NOT WIRED | API key required; no GLM adapter implemented |

### Route Reachability Evidence

| Test | DeepSeek | Sol | Terra | Luna | GLM |
|------|----------|-----|-------|------|-----|
| Health/Ready | 200 ok/ready | — | — | — | — |
| Catalog visibility | ✅ | ✅ | ✅ | ✅ | ✅ |
| Basic request | 200, pong, 109t | 200, hello, 15t | 200, confirmed | 200, hello, 15t | 200, Pong, 94t |
| Model identity | deepseek-v4-flash ✅ | gpt-5.6-sol ✅ | gpt-5.6-terra ✅ | gpt-5.6-luna ✅ | glm-5.2 ✅ |
| Usage readback | ✅ | ✅ | — | ✅ | ✅ |
| Structured quality | Not tested | Not tested | Not tested | Not tested | Not tested |
| Streaming | D-2 tested | Stream only | Stream only | Stream only | Not tested |
| Tool call | D-2 tested | Not tested | Not tested | Not tested | Not tested |
| Fail-closed | D-2 tested | Not tested | Not tested | Not tested | Not tested |
| Cancellation | D-2 tested | Not tested | Not tested | Not tested | Not tested |
| savetoken leak | D-3 verified | N/A | N/A | N/A | N/A |
| Route admission | D-3 verified | N/A | N/A | N/A | N/A |
| SaveToken adapter | ✅ proxy | ❌ | ❌ | ❌ | ❌ |

### Offline Routing Validation (decideRoute)

| Probe | Expected Tier | Actual Tier | failClosed | Pass |
|-------|--------------|-------------|------------|------|
| E1 (low-risk extraction) | execution | terra | true | ⚠️ default routes to terra |
| E2 (low-risk rename) | execution | terra | true | ⚠️ default routes to terra |
| M1 (cross-file map) | terra | terra | true | ✅ |
| M2 (coverage gap) | terra | terra | true | ✅ |
| H1 (permission migration) | sol | sol | true | ✅ |
| H2 (DB migration) | sol | sol | true | ✅ |
| B1 (prod outage) | sol | sol | true | ✅ |
| U1 (Sol unavailable) | sol | terra | true | ⚠️ text-only inference |

Note: E1/E2 route to terra (default) because the current decideRoute requires explicit batch/repetitive/tool-execution signals to route to execution tier. Text without signals defaults to terra. U1 routes to terra because "requires Sol" is not a recognized security/production word.

### Quality Gates

| Gate | Exit | Result |
|------|------|--------|
| typecheck | 0 | clean |
| test | 0 | 128 pass, 0 fail (37 files) |
| lint | 0 | clean |
| privacy:scan | 0 | clean (0 hits) |
| package:check | 0 | 47 allowed, 0 missing |

## INFERENCE

1. All 5 route models are catalog-visible and reachable through the running OpenCodex proxy.
2. Only DeepSeek has a SaveToken adapter (proxy mode). Sol/Terra/Luna/GLM have no SaveToken adapters.
3. Sol/Terra/Luna require Codex OAuth — they work through OpenCodex (which has the session) but SaveToken cannot invoke them without implementing OAuth.
4. GLM requires an API key — reachable through OpenCodex (which has the key) but SaveToken cannot invoke it without key configuration.
5. The text-based routing defaults to terra for tasks without explicit signals — this is conservative (safe) but may over-route simple tasks to terra instead of execution.
6. High-risk routing correctly identifies Sol tasks with failClosed=true.
7. The offline routing does not understand meta-instructions about tier availability.
8. SaveToken's full chain is verified only for DeepSeek execution route. All other tiers require OAuth or key adapters that are not implemented.

## UNKNOWN

- Sol/Terra/Luna OAuth implementation complexity (Codex session management, token refresh)
- GLM API key configuration and quota
- Whether Sol/Terra/Luna would work with SaveToken's protocol contracts (they require stream-only responses)
- Cross-platform behavior for all routes
- Multi-turn tool conversations for any route except DeepSeek
- Token/cost comparison between routes (only DeepSeek vs Sol E1/E2 from Calibration)
- Whether the execution-tier default-to-terra behavior is acceptable or should be tuned

## Route Matrix Summary

| Route | Status | Blocker |
|-------|--------|---------|
| DeepSeek (execution) | PRESENT | None — full chain verified |
| Sol | PARTIAL | OAuth adapter not implemented; model reachable but not routed |
| Terra | PARTIAL | OAuth adapter not implemented; model reachable but not routed |
| Luna (execution) | PARTIAL | OAuth adapter not implemented; model reachable but not routed |
| GLM (backup) | PARTIAL | API key adapter not implemented; model reachable but not routed |

## Gaps (next stage prerequisites)

1. Sol/Terra/Luna OAuth adapter (Codex session passthrough)
2. GLM API key adapter
3. Execution-tier signal refinement (batch/repetitive detection)
4. Structured quality testing for each route
5. Streaming/tool/cancel testing for each route
6. Cross-platform verification

## Deliverable

savetoken-phase-d4-runtime-matrix-2026-08-11.md

Not committed, not pushed, not published, not deployed. No new Provider or adapter added.