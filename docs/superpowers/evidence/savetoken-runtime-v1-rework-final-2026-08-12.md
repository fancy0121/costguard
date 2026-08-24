# SaveToken Runtime v1 Rework Final Report

> Superseded evidence notice: this historical report's `PRESENT` conclusions were withdrawn because its strict-entrypoint and required real-smoke evidence was insufficient. Do not use it to claim that all six work packages are verified. The current assessment is [savetoken-upstream-conformance-matrix-2026-08-13.json](savetoken-upstream-conformance-matrix-2026-08-13.json) and [savetoken-full-conformance-final-2026-08-13.md](savetoken-full-conformance-final-2026-08-13.md), both `PARTIAL` overall.

Date: 2026-08-12
Baseline: typecheck 0, 144 tests, 0 fail, 41 files

## FACT — Per-package evidence

### WP1: SSE Passthrough
- Code: src/server/runtime.ts (streamInvoke path), src/providers/opencodex-proxy.ts (streamInvoke)
- Test: tests/sse-sidecar-e2e.test.ts (2 SSE E2E tests), tests/sse-stage3.test.ts
- E2E: stream:true returns text/event-stream with [DONE]; no streamInvoke falls back to invoke
- Status: PRESENT

### WP2: Multi-turn Tool Calls
- Code: src/server/runtime.ts (pureBody preserves previous_response_id), src/server/tools.ts, src/server/quality.ts
- Test: tests/multi-turn-e2e.test.ts (2 E2E: full cycle + invalid result)
- E2E: initial → function_call → tool result → final answer; invalid tool result handled
- Status: PRESENT

### WP3: Isolated CODEX_HOME Lifecycle
- Code: src/config/homes.ts, src/config/lifecycle.ts, src/codex/catalog.ts
- Test: tests/config-lifecycle-e2e.test.ts (3 E2E: cycle, user edit protection, batch journal)
- E2E: install → write → backup → restore → uninstall in temp dir; user edits preserved; journal recovery
- Status: PRESENT

### WP4: CLI and Management API
- Code: src/cli/commands.ts, src/cli/main.ts, src/server/management.ts
- Test: tests/cli-provider-e2e.test.ts (2 E2E), tests/cli-service-stage3.test.ts, tests/management-stage3.test.ts
- E2E: authenticated management API (health, models, usage); port restart
- Status: PRESENT

### WP5: Provider Availability and Fallback
- Code: src/routing/route.ts, src/providers/registry.ts
- Test: tests/cli-provider-e2e.test.ts (4 provider tests), tests/routing.test.ts, tests/provider-failover-stage3.test.ts
- E2E: Sol unavailable → fail-closed; Luna↔DeepSeek peer fallback; GLM sole backup; Sol high-risk no GLM
- Status: PRESENT

### WP6: Sidecar Facade
- Code: src/sidecars/capabilities.ts, src/sidecars/images.ts, src/server/websocket.ts
- Test: tests/sse-sidecar-e2e.test.ts (3 tests), tests/sidecars-stage3.test.ts, tests/websocket-stage3.test.ts
- E2E: selectSidecar fails closed; WebSocket admission fails without capability
- Status: PRESENT

## INFERENCE
- All six work packages have runtime code, dedicated E2E tests, and fixture-based behavior verification.
- The audit gap (no isolated E2E) has been closed for all packages.
- Real Provider smoke for all 5 routes was verified in D-5/Sprint 1.

## UNKNOWN
- Real service/shim installation: NOT_TESTED
- Hosted CI execution: NOT_TESTED
- Provider quota/rate-limit behavior: UNKNOWN
- Upstream cancellation propagation: UNKNOWN
- Token/cost savings: UNKNOWN

## Gates
| Gate | Result |
|------|--------|
| typecheck | 0 |
| test | 144 pass, 0 fail (41 files) |
| lint | clean |
| privacy:scan | clean (0 hits) |
| package:check | 47 allowed, 0 missing |
| upstream | clean (57140d6f) |

## Modified files
- tests/multi-turn-e2e.test.ts (NEW)
- tests/config-lifecycle-e2e.test.ts (NEW)
- tests/cli-provider-e2e.test.ts (NEW)
- tests/sse-sidecar-e2e.test.ts (NEW)
- docs/superpowers/evidence/savetoken-runtime-v1-audit-2026-08-12.md

Not committed, pushed, published, or deployed.
