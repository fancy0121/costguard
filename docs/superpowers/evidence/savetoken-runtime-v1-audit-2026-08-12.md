# SaveToken Runtime v1 Evidence Audit

Date: 2026-08-12
Baseline: typecheck 0, 128 tests across 37 files, OpenCodex PID 12832

## Work Package 1: SSE Passthrough

| Item | Evidence |
|------|----------|
| Runtime code | src/server/runtime.ts — streamInvoke path at line ~190 |
| Adapter code | src/providers/opencodex-proxy.ts — streamInvoke method |
| Test file | tests/sse-stage3.test.ts (SSE parser tests only) |
| Isolated E2E | NONE — no dedicated SSE E2E test |
| Real smoke | NOT_TESTED systematically |
| Commands | N/A |
| Status | PARTIAL |
| Gap | No dedicated SSE E2E test; no multi-protocol SSE contract test |

## Work Package 2: Multi-turn Tool Calls

| Item | Evidence |
|------|----------|
| Runtime code | src/server/runtime.ts — previous_response_id passthrough via pureBody |
| Tool collection | src/server/tools.ts — collectToolGroups |
| Quality gate | src/server/quality.ts — validateQualityContract |
| Test file | tests/tools-stage3.test.ts, tests/quality-gate-stage4.test.ts |
| Isolated E2E | NONE — no multi-turn runtime E2E |
| Real smoke | Single manual test only (not automated) |
| Commands | N/A |
| Status | PARTIAL |
| Gap | No multi-turn conversation E2E; no fixture test for tool result → continuation flow |

## Work Package 3: Isolated CODEX_HOME Lifecycle

| Item | Evidence |
|------|----------|
| Config code | src/config/homes.ts, src/config/lifecycle.ts, src/codex/catalog.ts |
| Write code | src/config/homes.ts — atomicWriteOwnedJson, atomicWriteOwnedJsonBatch |
| Restore code | src/config/lifecycle.ts — restoreOwnedState, uninstallOwnedState |
| Test file | tests/config-lifecycle-stage3.test.ts, tests/config-ownership-stage3.test.ts |
| Isolated E2E | Manual test only (not automated) |
| Real smoke | N/A (no real CODEX_HOME writes) |
| Commands | N/A |
| Status | PARTIAL |
| Gap | No automated isolated E2E for install→status→restore→uninstall cycle |

## Work Package 4: CLI and Management API

| Item | Evidence |
|------|----------|
| CLI code | src/cli/commands.ts, src/cli/main.ts |
| Management code | src/server/management.ts |
| Test file | tests/cli-service-stage3.test.ts, tests/management-stage3.test.ts |
| Isolated E2E | NONE |
| Real smoke | N/A |
| Commands | N/A |
| Status | PARTIAL |
| Gap | No port conflict, restart, stale state E2E |

## Work Package 5: Provider Control Plane

| Item | Evidence |
|------|----------|
| Route code | src/routing/route.ts — decideRoute, isTierAllowed |
| Registry code | src/providers/registry.ts — invokeWithFailover, GLM safety |
| Availability | NOT IMPLEMENTED (no available/unavailable/unknown runtime state) |
| Test file | tests/routing.test.ts, tests/provider-failover-stage3.test.ts |
| Isolated E2E | NONE |
| Real smoke | All 5 routes manually verified (D-5, Sprint 1) |
| Commands | N/A |
| Status | PARTIAL |
| Gap | No runtime availability state; no automated GLM safety matrix E2E |

## Work Package 6: Sidecar Facade

| Item | Evidence |
|------|----------|
| Sidecar code | src/sidecars/capabilities.ts, src/sidecars/images.ts |
| WebSocket code | src/server/websocket.ts |
| Test file | tests/sidecars-stage3.test.ts, tests/websocket-stage3.test.ts |
| Isolated E2E | NONE |
| Real smoke | N/A (no real sidecar adapters) |
| Commands | N/A |
| Status | PARTIAL |
| Gap | No sidecar E2E with fail-closed verification |

## Summary

All packages have runtime code and tests. ALL are PARTIAL due to missing isolated E2E tests and/or real provider smoke.
Priority: WP2 (multi-turn tools) → WP3 (config lifecycle) → WP4 (CLI) → WP5 (provider) → WP1 (SSE) → WP6 (sidecar)