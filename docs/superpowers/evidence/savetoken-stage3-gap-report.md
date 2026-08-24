# SaveToken Stage 3 Capability Gap Report

> Historical Stage 3 notice: this report is retained as a snapshot. Its implementation and test counts predate the Runtime v1 and 2026-08-13 reconciliation work. Current capability states are recorded in [savetoken-upstream-conformance-matrix-2026-08-13.json](savetoken-upstream-conformance-matrix-2026-08-13.json) and [savetoken-full-conformance-final-2026-08-13.md](savetoken-full-conformance-final-2026-08-13.md).

Date: 2026-08-09  
Reference implementation: OpenCodex `2.11.0`, commit `57140d6f06218d604ee139e5909a1b868bf7a84b`.

## FACT

- Stage 3 local work is confined to `savetoken-runtime/`; `work/opencodex-upstream` remains read-only.
- Implemented local contracts cover credential-free provider descriptors, auth-reference separation, quota/cooldown/affinity eligibility, explicit low-risk failover, catalog ownership backup/restore, effort caps, subagent fallback, combos, authenticated management routes, CLI request dispatch, owned-state uninstall, sidecar selection, usage redaction, package allowlisting, calibration, and a Windows/macOS/Linux CI workflow.
- The complete row-by-row status overlay is in [savetoken-stage3-final-parity-matrix.md](savetoken-stage3-final-parity-matrix.md).
- HTTP execution admission now requires a server-supplied structured route signal, explicit `provider/model` requests remain the first candidate, readiness checks a declared-route/healthy-adapter intersection, and `PRESENT` adapter evidence must identify the requested route.

## INFERENCE

- The delivered runtime is a safe local contract layer, not a complete OpenCodex runtime replacement.
- High-risk fallback is fail-closed in the credential-free provider and subagent contracts; no local contract authorizes silent downgrade to an execution model.
- The management plane is separate from the data plane and requires an explicit bearer value supplied by environment reference.

## UNKNOWN

- OAuth exchange, API-key exchange, live model discovery, real Provider calls, actual runtime model identity, quota/account health, key/account pool persistence, and external cancellation propagation.
- Real Responses/Chat/Anthropic completions, streaming provider events, tool-call round trips, image/vision/search adapters, WebSocket behavior, and error fidelity against each provider.
- Native Codex catalog injection, v1/v2 agent surfaces, crash recovery, service/shim installation, rendered GUI behavior, hosted CI results, and cross-platform runtime behavior.
- No cost, quota-savings, latency, or quality percentage is measured by this stage.
- The local Sol architecture review identified and the mainline regression tests cover the HTTP route-admission and explicit-route precedence boundaries above; this does not establish real Provider parity.

## Release boundary

The package is not publish-ready under the frozen Stage 3 acceptance contract. It is locally testable and safe to inspect, but real Provider/protocol/service/install behavior and the remaining `PARTIAL`, `MISSING`, `NOT_TESTED`, and `UNKNOWN` rows require separate implementation and execution.
