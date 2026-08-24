# Runtime v1 Evidence Repair 2 — Audit Corrections

## 2026-08-24 evidence refresh

The current source and a newly copied clean-room were rerun after adding the two missing same-runtime protocol-session checks. This section supersedes the 2026-08-20 test totals, but it does not upgrade external capabilities.

| Work package | 2026-08-24 correction evidence | Status | Remaining gap |
| --- | --- | --- | --- |
| WP1 multi-turn tools | Chat and Anthropic now each execute initial request → native tool call → client tool result → second request → final response through one running SaveToken runtime. The focused two-file suite is 10/10. | `PARTIAL` | A current real DeepSeek multi-turn smoke is `UNKNOWN`; model/effort overrides were prohibited after the running Codex model catalog changed. |
| WP2 isolated config/catalog | No production change. Existing isolated management/config tests and clean-room suite passed. | `PARTIAL` | Config and catalog are not proven as one crash-atomic multi-file transaction; native Codex consumption remains `UNKNOWN`. |
| WP3 CLI/management | Existing subprocess and runtime lifecycle evidence reran successfully. | `PRESENT` (local runtime scope) | OS service/shim remains `NOT_TESTED`. |
| WP4 Provider control plane | Existing fake-clock/error/fallback tests reran successfully. | `PARTIAL` | No current real Provider error/cooldown smoke. |
| WP5 SSE | Existing three-protocol local fixture contracts reran successfully. | `PARTIAL` | Current real DeepSeek stream smoke was not sent; external stream remains `UNKNOWN`. |
| WP6 sidecar facade | Existing local facade/WebSocket lifecycle tests reran successfully. | `PARTIAL` | No real external sidecar was called. |

FACT: Bun 1.3.14; source typecheck 0, 302 tests passed, 0 failed, 1077 assertions across 71 files, lint 0, privacy 0 hits, package check 132 allowed/657 excluded/0 missing. A fresh system-temporary clean-room copy (excluding `.git`, `node_modules`, logs and `.env`) had copy exit 1 (Robocopy success), frozen install 0, typecheck 0, 302 tests passed, 0 failed, 1072 assertions across 71 files, lint 0, privacy 0 hits and package check 0. The assertion-count difference is explained by the clean-room package excluding the project-root `.github` workflow; hosted CI was not run and is `NOT_TESTED`.

INFERENCE: the new tests close the previously documented Chat/Anthropic local-session evidence gap without requiring production-code changes. They do not establish real Provider behavior or OpenCodex parity.

UNKNOWN: real DeepSeek multi-turn/SSE, upstream cancellation propagation, real quota/cooldown/auth failures, native Codex consumption, external sidecars, OS services and hosted CI.

## Superseded 2026-08-20 reconciliation

The historical baseline below is retained as the original correction list. It is not current acceptance evidence. The current source tree was independently rerun with Bun 1.3.14: 300 tests passed, 0 failed, across 71 files. Overall status remains `PARTIAL`.

| Work package | Old evidence defect | Current strict evidence | Current status | Remaining gap |
| --- | --- | --- | --- | --- |
| WP1 multi-turn tools | Missing-ID test could hit unknown-conversation; tool name and in-flight cancellation were not enforced | A known Responses conversation now asserts exact missing-ID reason; explicit tool-name mismatch returns 422 before continuation; Provider results after abort are discarded; focused suite 28/28 | `PARTIAL` | Chat and Anthropic complete-transcript tests are not same-runtime two-request sessions; current real DeepSeek smoke is `UNKNOWN` |
| WP2 isolated config/catalog | Low-level helpers and file presence were previously overclaimed | Real management install/status/sync/restore/uninstall, journal recovery, ownership, CRLF and user-edit preservation; focused suite 29/29 | `PARTIAL` | Config and catalog operations are not one crash-atomic multi-file transaction; native Codex consumption is `UNKNOWN` |
| WP3 CLI/management | Lifecycle tests called management API directly; stale PID and port conflict did not exercise CLI subprocesses | Actual CLI subprocess covers install/status/sync/doctor/restore/uninstall/start/stop; stale PID returns nonzero; second runtime on the same port fails; unauthorized request is exact 401; stop removes endpoint; 6/6 | `PRESENT` (local runtime scope) | OS service/shim lifecycle remains outside this work package and `NOT_TESTED` |
| WP4 Provider control plane | Manual candidate construction could fake fallback | Fake-clock cooldown, 401/403/429/5xx/network/identity matrix, peer fallback, GLM-last and high-risk fail-closed; 16/16 | `PARTIAL` | No current real Provider error/cooldown smoke; proxy catalog timed out in this run |
| WP5 SSE conformance | Fixture streams and permissive non-stream fallback were overclaimed | Three protocol content type, terminal, missing-terminal, error and cancellation contracts; 19/19 | `PARTIAL` | SaveToken intentionally rejects proxy streams whose terminal model identity cannot be verified; current real DeepSeek stream smoke is `UNKNOWN` |
| WP6 sidecar facade | Admission-only fixtures were called a lifecycle | Runtime WebSocket success, authorization, allowlist, invalid message, cancellation and close paths; 10/10 | `PARTIAL` | No real external search/vision/image sidecar was called |

FACT: source gates and clean-room gates passed. INFERENCE: the repaired local boundaries are stronger than the withdrawn 2026-08-13 evidence. UNKNOWN: external Provider, upstream cancellation propagation, native Codex consumption, external sidecars, OS services and hosted CI.

Date: 2026-08-13
Baseline: 144 tests, typecheck 0

## Corrections Needed

### WP1 Multi-turn tools (tests/multi-turn-e2e.test.ts)
- OLD: "invalid tool result JSON fails closed" allows [200,400,422] — TOO PERMISSIVE
- FIX: missing call_id → strict 400/422; unknown call_id → strict 400/422; duplicate tool result → strict 400/422; tool name mismatch → strict 400/422
- FIX: no continuation when tool result missing
- FIX: cancellation produces no completed response
- FIX: three-protocol session closure (Responses/Chat/Anthropic)

### WP2 Config lifecycle (tests/config-lifecycle-e2e.test.ts)
- OLD: calls low-level writeCatalog/atomicWriteOwnedJson directly
- FIX: call real install/status/sync/restore/uninstall entry points
- FIX: user config.toml preset + user content preserved
- FIX: journal残留/半写入 recovery through real entry point
- FIX: idempotency + format-incompatible fail-closed

### WP3 CLI/management (tests/cli-provider-e2e.test.ts)
- OLD: in-process fetch; no subprocess CLI execution
- FIX: subprocess CLI install/status/sync/restore/uninstall/doctor
- FIX: machine-readable JSON stdout + non-zero exit codes
- FIX: fixed-port conflict (second instance fails)
- FIX: stop → /readyz not ready
- FIX: 401 without prompt/credential/absolute path leaks
- FIX: doctor detects stale PID/state

### WP4 Provider availability
- OLD: manually passes GLM-only candidate to prove "GLM backup"
- FIX: fake-clock cooldown; 401/403/429/5xx/network/model-mismatch matrix
- FIX: Luna→DeepSeek only when Luna explicitly unavailable
- FIX: unknown execution state blocks GLM
- FIX: GLM only when both unavailable + low-risk
- FIX: Sol/Terra unavailable/unknown → fail-closed
- FIX: assert route admission evidence tier/reason/availability source

### WP5 SSE conformance
- OLD: "stream without streamInvoke returns result normally" — ALLOWS FAKE PASS
- FIX: stream:true without streamInvoke → fail-closed 422, NOT JSON
- FIX: three-protocol E2E with Content-Type/event-order/terminal/error/cancel
- FIX: real DeepSeek streaming smoke

### WP6 Sidecar
- OLD: only rejection paths
- FIX: success path for configured capability
- FIX: whitelist/invalid-config/unavailable/permission-denied distinct behavior
- FIX: WebSocket authorized success + close path

## Implementation order
WP1 → WP2 → WP3 → WP4 → WP5 → WP6, each: failing test → minimal fix → pass → next.
