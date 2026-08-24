# SaveToken Stage 3 Final Parity Matrix

Audit date: 2026-08-09  
Reference: `savetoken-opencodex-parity-matrix.md` (53 capability rows), Stage 2 runtime, and Stage 3 local contracts.  
Scope: local, credential-free implementation evidence only. No row below claims a real external Provider invocation.

Allowed statuses: `PRESENT`, `MISSING`, `PARTIAL`, `NOT_TESTED`, `UNKNOWN`.

| ID | Capability | Status | Local evidence / boundary |
|---|---|---|---|
| RT-01 | CLI entrypoints | PARTIAL | `src/cli/commands.ts`, `src/cli/main.ts`; lifecycle request boundary, configured-port resolution, and nonzero UNKNOWN exit tests; full installed CLI surface not tested. |
| RT-02 | Proxy lifecycle | PARTIAL | Bun runtime start/stop smoke exists; drain/crash lifecycle not implemented. |
| RT-03 | Service and shim | PARTIAL | `src/service/lifecycle.ts` emits platform plans only; installation and shim execution NOT_TESTED. |
| RT-04 | Health and readiness | PRESENT | `src/server/health.ts`, runtime smoke tests including declared-route/readiness mismatch. |
| RT-05 | Restore | PARTIAL | Owned catalog/state restore and hashed TOML marker preservation are tested; native Codex-home restore is NOT_TESTED. |
| RT-06 | Uninstall | PARTIAL | `uninstallOwnedState` removes only SaveToken owner-marked files; service removal NOT_TESTED. |
| RT-07 | `CODEX_HOME` | PRESENT | Isolated home resolution and smoke tests. |
| RT-08 | `OPENCODEX_HOME` | MISSING | No OpenCodex-home compatibility owner exists in SaveToken runtime. |
| RT-09 | Atomic writes | PARTIAL | `atomicWriteOwnedJson`, staged batch preflight, and content-hash ownership tests; crash recovery remains NOT_TESTED. |
| RT-10 | Crash recovery | MISSING | No crash-guard or stale-job recovery implementation. |
| DP-01 | Responses API | PARTIAL | Independent parser/validation, pure-body dispatch, native response-shaping, and runtime contract tests; no upstream adapter/completion. |
| DP-02 | Chat Completions | PARTIAL | Independent parser/validation, pure-body dispatch, native response-shaping, and `/v1/chat/completions` contract tests; no upstream adapter/completion. |
| DP-03 | Anthropic Messages | PARTIAL | Independent parser/validation (including `max_tokens`), pure-body dispatch, native response-shaping, and `/v1/messages` contract tests; no upstream adapter/completion. |
| DP-04 | Streaming | PARTIAL | `src/server/sse.ts` parses optional colon spacing, multiline data, EOF dispatch, and terminal states; no real SSE provider stream. |
| DP-05 | Tool calls | PARTIAL | `src/server/tools.ts` preserves Responses top-level/additional tool groups and Chat/Anthropic top-level tools; no provider round-trip. |
| DP-06 | Cancellation | PARTIAL | HTTP signal binds local token; upstream cancellation remains UNKNOWN. |
| DP-07 | Images | PARTIAL | Explicit image sidecar adapter boundary validates prompts and fails closed without an injected adapter; no real image provider or artifact round-trip. |
| DP-08 | Error translation | PARTIAL | Redacted stable mapping in `src/server/errors.ts`; provider-specific fidelity NOT_TESTED. |
| DP-09 | WebSocket behavior | PARTIAL | Explicit WebSocket capability admission fails closed when unavailable; no WebSocket bridge or lifecycle round-trip. |
| DP-10 | Web-search sidecar | PARTIAL | Explicit sidecar selector exists; search adapter absent. |
| DP-11 | Vision sidecar | PARTIAL | Explicit sidecar selector exists; vision adapter absent. |
| PA-01 | Provider registry | PARTIAL | Credential-free `ProviderRegistry` tests reject unsafe provider/model route identifiers, unverified runtime evidence, expose fallback chains, and forward protocol bodies; live discovery/calls remain unavailable. |
| PA-02 | Live model discovery | MISSING | No live discovery request. |
| PA-03 | Explicit `provider/model` routing | PRESENT | Route resolver, registry, HTTP explicit-route precedence, and execution route-signal fail-closed tests. |
| PA-04 | Default provider | PRESENT | Existing route tests. |
| PA-05 | OAuth | PARTIAL | Env-reference separation only; OAuth exchange/refresh NOT_TESTED. |
| PA-06 | API keys | PARTIAL | Env-reference separation only; API-key exchange NOT_TESTED. |
| PA-07 | Key pools | PARTIAL | Opaque environment-reference key pool selects eligible provider keys and fails closed on invalid/health/cooldown states; rotation and real key use are NOT_TESTED. |
| PA-08 | Account pools | PARTIAL | Opaque account eligibility/affinity selector; persistence/rotation NOT_TESTED. |
| PA-09 | Quota | PARTIAL | Measured/unknown quota selection contract; live quota source UNKNOWN. |
| PA-10 | Cooldown | PRESENT | Local cooldown exclusion contract tested. |
| PA-11 | Health | PRESENT | Explicit health states and local tests. |
| PA-12 | Account affinity | PRESENT | Eligible affinity selection tested. |
| CA-01 | Catalog backups | PRESENT | Owned catalog backup/restore tests. |
| CA-02 | Catalog visibility | PARTIAL | Runtime catalog projection and isolated CODEX_HOME projection are tested; full capability admission remains incomplete. |
| CA-03 | Selected models | PARTIAL | Selected/subagent/injection flags are projected into an ownership-scoped isolated catalog; native Codex catalog injection remains NOT_TESTED. |
| CA-04 | Account priorities | PARTIAL | Local account selection honors explicit priority after eligibility checks; persistence and management mutation are NOT_TESTED. |
| CA-05 | `subagentModels` | PARTIAL | Bounded subagent fallback contract; management persistence absent. |
| CA-06 | `injectionModel` | PARTIAL | Catalog field and projection only; native injection NOT_TESTED. |
| CA-07 | `injectionEffort` | PRESENT | Effort cap monotonicity test. |
| CA-08 | v1/v2 surfaces | PARTIAL | Explicit v1/v2 mode and visible subagent-model resolver is tested; native multi-agent transition and spawn round-trip remain NOT_TESTED. |
| CA-09 | Effort caps | PRESENT | `clampEffort` contract and test. |
| CA-10 | Subagent fallback | PRESENT | High-risk fallback fail-closed test. |
| CA-11 | Combos | PRESENT | Ordered combo resolution, complete route-tier map, GLM-last ordering, and missing-route fail-closed tests. |
| GM-01 | Dashboard routes | PARTIAL | Dashboard view model and management catalog; no rendered GUI. |
| GM-02 | Authentication | PRESENT | Separate management bearer boundary tested; token values are env references only. |
| GM-03 | API ownership | PARTIAL | Central management handler owns `/api/*`; sync invalidation beyond local state absent. |
| GM-04 | Logs | PARTIAL | Bounded in-memory `DebugLog` and authenticated `/api/logs` are tested; durable debug persistence and upstream parity remain NOT_TESTED. |
| GM-05 | Usage | PARTIAL | Redacted bounded `UsageLog` and `/api/usage`; no provider-measured usage. |
| GM-06 | Privacy scan | PRESENT | Runtime privacy scan and tests pass locally. |
| GM-07 | Package preparation | PARTIAL | Package allowlist and check script; publish/release pipeline NOT_TESTED. |
| GM-08 | Documentation synchronization | PARTIAL | README, gap report, and CI docs updated; upstream docs sync NOT_TESTED. |
| GM-09 | Cross-platform CI | NOT_TESTED | Matrix workflow declares Windows/macOS/Linux but hosted CI has not run here. |

## Interpretation

- `PRESENT` means the local contract has implementation plus a focused test in this workspace; it does not mean upstream parity or external invocation.
- `PARTIAL` means only the credential-free/local boundary is implemented.
- `MISSING` means no SaveToken owner was added for that capability.
- `NOT_TESTED` means an artifact or workflow exists but execution evidence is absent.
- `UNKNOWN` is reserved for behavior that cannot be established from local evidence.
