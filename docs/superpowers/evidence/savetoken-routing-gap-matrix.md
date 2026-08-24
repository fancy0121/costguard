# SaveToken Routing Gap Matrix

Stage 1 artifact. This document defines the boundary between verified OpenCodex runtime behavior and the additional SaveToken orchestration contract. It does not implement routing.

Audit date: 2026-08-08  
Upstream baseline: `@bitkyc08/opencodex` `2.11.0`, commit `57140d6f06218d604ee139e5909a1b868bf7a84b`, branch `main`.  
Upstream source manifest SHA-256: `6B1F8A3349F1B788998F95A56A4BD74EDFB1FA8EB52D478B328BA485B3A84410`.

## Status semantics

Each status is one of `PRESENT`, `MISSING`, `PARTIAL`, `NOT_TESTED`, or `UNKNOWN`.

- `contract_status` describes whether the rule is explicitly stated in `SAVETOKEN_SPEC.md`, the project plan, or the upstream structure/source contract.
- `implementation_status` describes the current SaveToken project. The project currently has no SaveToken runtime `src/` or test owner outside `work/opencodex-upstream`, so contract-only rows remain `MISSING` for implementation.
- `runtime_status` records whether the behavior was actually exercised in Stage 1. Static reading, a catalog entry, a task name, or a source path is not a runtime invocation.

| ID | Routing boundary | Verified upstream evidence | SaveToken rule / increment | contract_status | implementation_status | runtime_status | Required focused test |
|---|---|---|---|---|---|---|---|
| RG-01 | Runtime parity versus orchestration | `SAVETOKEN_SPEC.md`; `structure/00_overview.md`; `src/router.ts` | OpenCodex remains the execution foundation. SaveToken may add task classification and quality gates but must not rewrite provider behavior to fake parity. | PRESENT | MISSING | NOT_TESTED | Contract test proving orchestration cannot bypass runtime route identity |
| RG-02 | High-risk safety gate | `SAVETOKEN_SPEC.md` routing rules; `src/router.ts`; `src/config.ts` | Architecture, security, permissions, production data, migration, major refactor, cross-module scope, or a blocker routes at least to Terra and may require Sol. No execution-tier fallback may clear the signal. | PRESENT | MISSING | NOT_TESTED | Table-driven safety monotonicity test |
| RG-03 | Sol boundary | `SAVETOKEN_SPEC.md`; project plan Stage 2 interface | Sol handles highest difficulty, architecture, security, major refactor, and genuine blockers; it is not a batch worker. | PRESENT | MISSING | NOT_TESTED | Sol boundary and no-routine-batch test |
| RG-04 | Terra boundary | `SAVETOKEN_SPEC.md`; project plan Stage 2 interface | Terra handles medium-complexity design, code mapping, test design, and bounded multi-file work; unresolved judgment escalates to Sol. | PRESENT | MISSING | NOT_TESTED | Terra-to-Sol escalation test |
| RG-05 | Execution tier | `src/codex/subagent-model-fallback.ts`; `src/cli/agent.ts`; `src/codex/subagent-defaults.ts` | Luna and DeepSeek are peer execution candidates. Luna may be preferred for file/tool work; DeepSeek may be preferred for text-heavy extraction. Neither preference is a quality guarantee. | PRESENT | MISSING | NOT_TESTED | Candidate selection and explicit preference test |
| RG-06 | GLM backup | `SAVETOKEN_SPEC.md`; project plan routing contract | GLM is the last low-risk backup only after verified routes are unavailable. High-risk work fails closed instead of silently reaching GLM. | PRESENT | MISSING | NOT_TESTED | Low-risk-only GLM fallback and high-risk fail-closed test |
| RG-07 | Ambiguity and contradiction | `SAVETOKEN_SPEC.md` quality gates; `src/router.ts` route errors | Missing information, contradictory classification, scope drift, low confidence, provider failure, or test failure escalates or fails closed. | PRESENT | MISSING | NOT_TESTED | Ambiguous-signal escalation test |
| RG-08 | Explicit route identity | `src/router.ts`; `src/providers/slug-codec.ts`; `src/config.ts` | An explicit `provider/model` route wins over a default provider. SaveToken classification cannot silently replace an explicit route. | PRESENT | MISSING | NOT_TESTED | Explicit-route precedence test |
| RG-09 | Worker scope | `src/cli/agent.ts`; `src/codex/subagent-defaults.ts` | A worker executes only the parent-assigned bounded task, does not redefine acceptance criteria, and does not perform final risk judgment. | PRESENT | MISSING | NOT_TESTED | Scope-preservation and no-final-judgment test |
| RG-10 | Fallback boundary | `src/codex/subagent-model-fallback.ts`; `tests/subagent-model-fallback.test.ts` | Fallback is allowed only where the task tier permits it. Sol/Terra work cannot silently downgrade to Luna, DeepSeek, or GLM. | PRESENT | MISSING | NOT_TESTED | Tier-aware fallback denial test |
| RG-11 | Independent validation | `SAVETOKEN_SPEC.md` quality gates; upstream focused tests listed in parity matrix | Worker output requires parent-agent review, evidence validation, and relevant tests. Worker self-report is not acceptance evidence. | PRESENT | MISSING | NOT_TESTED | Worker-result validation and evidence-preservation test |
| RG-12 | Actual model identity | `SAVETOKEN_SPEC.md`; project plan Stage 1 UNKNOWN rules | A configured model, catalog row, task title, or agent name is not proof of invocation. Actual runtime model is `UNKNOWN` until read back from an execution record or verified surface. | PRESENT | MISSING | UNKNOWN | Model identity readback probe with no secret capture |
| RG-13 | Provider availability | `SAVETOKEN_SPEC.md` current unknowns; upstream provider registry/source | Provider health, quota, rate limits, and account access must be measured at runtime. Unavailable or unverified providers remain `UNKNOWN`. | PRESENT | MISSING | UNKNOWN | Credential-free health/ready probe and explicit unknown result |
| RG-14 | Evidence record | `AGENTS.md`; project plan required report format; baseline and parity artifacts | Every route decision records tier, candidates, escalation reason, actual model if known, evidence state, and unverified items. | PRESENT | MISSING | NOT_TESTED | Redacted route-decision evidence schema test |
| RG-15 | Quality preservation | `SAVETOKEN_SPEC.md` quality gates; parity matrix | “Lower token use” is not evidence of preserved quality. Baseline acceptance outcomes and failed-route evidence are required before any quality claim. | PRESENT | MISSING | NOT_TESTED | Calibrated acceptance comparison test |

## Stage 1 conclusion

The routing contract is present in the project documents, while the executable SaveToken implementation and focused tests are not present in the current project tree. This is a deliberate Stage 1 boundary. No route was invoked and no provider/account availability was inferred.
