# SaveToken Stage 2 Report

Stage: 2  
Result: PASS

## FACT

- Stage 1 was explicitly accepted by the user before Stage 2 began.
- `work/opencodex-upstream` was not modified. Its commit remains `57140d6f06218d604ee139e5909a1b868bf7a84b`; `git -C work/opencodex-upstream status --short` is empty.
- Created the isolated runtime foundation at `savetoken-runtime/` with Bun/TypeScript, a lockfile, source modules, tests, and privacy/lint scripts.
- Implemented:
  - typed SaveToken routing decisions for Sol, Terra, execution, and fail-closed paths;
  - explicit `provider/model` routing and default-provider fallback only when no explicit route exists;
  - effective `CODEX_HOME`/`SAVETOKEN_HOME` resolution;
  - atomic owned JSON writes and ownership-scoped restore;
  - separate health and readiness states;
  - Responses, Chat Completions, and Anthropic request normalization with tool preservation;
  - completed/incomplete/failed/cancelled terminal states and observable cancellation;
  - redacted route evidence with `actualRuntimeModel: "UNKNOWN"` until readback exists;
  - local privacy scanning and placeholder linting;
  - a Bun HTTP runtime exposing `/healthz`, `/readyz`, `/v1/models`, `/v1/responses`, `/v1/chat/completions`, and `/v1/messages` route-preview behavior.
- Addressed three P1 review findings:
  - Chinese security, permission, production, deployment, architecture, and related high-risk terms now escalate to Sol before execution-tier checks;
  - restore removes a SaveToken-owned assignment only when the ownership marker matches that assignment key, preserving unrelated user configuration;
  - request `AbortSignal` is bound to a cancellation token, checked during route processing, and returns a fail-closed cancellation response when cancellation is observed.
- Dependency installation was isolated to `savetoken-runtime`; `node_modules` is not a delivery artifact.
- Bun 1.3.14 was available through the discovered direct executable for validation; Bun was not on `PATH`.
- Actual verification commands and results:

  ```text
  npx --yes bun@1.3.14 install --frozen-lockfile       exit 0
  bun run typecheck                                   exit 0
  bun run lint                                        exit 0
  bun test                                            exit 0
  22 pass, 0 fail, 63 expect() calls
  bun run privacy:scan                                exit 0
  privacy scan clean: 0 hits
  ```

- Isolated runtime smoke tests exercised a real Bun server in temporary homes:
  - health and readiness returned separately;
  - `CODEX_HOME` remained untouched;
  - SaveToken state was written only to the isolated SaveToken home;
  - `/v1/models` exposed the configured catalog;
  - explicit route preview resolved the requested provider;
  - unknown provider route returned HTTP 503 with `status: "UNKNOWN"` and `failClosed: true`.
- Stage 2 change manifest: [savetoken-stage-2-change-manifest.json](savetoken-stage-2-change-manifest.json).
- Runtime manifest SHA-256: `DB704BCC3735F5F05EE9F45E7E0277E1D11B5582F958F86DCD8B7B52A7E0D894` (27 sorted runtime file-path/content-hash entries, excluding `node_modules`).
- `bun.lock` SHA-256: `B9ED3B879245F6EBF5A3586715ADB6FCF70F95CB59A6D2E65F62E67AE3EC78D9`.

## INFERENCE

- The Stage 2 acceptance gate is satisfied for the implemented foundation: isolated startup, distinct health/readiness, explicit route precedence, high-risk fail-closed routing, ambiguity escalation, protocol normalization, terminal-state handling, cancellation, restore, and privacy tests all have executable evidence.
- The runtime deliberately stops at a route-preview boundary. It proves local routing and protocol contracts without pretending to have successfully invoked an external provider.
- The implementation is additive under `savetoken-runtime/` and does not alter the read-only OpenCodex reference.

## UNKNOWN

- Actual provider invocation and actual runtime model identity remain `UNKNOWN`.
- A read-only `sol_decider` architecture-review dispatch was attempted but returned no report before implementation; no subagent output or unverified model claim was used. The main line independently followed the written Stage 2 plan and acceptance gate.
- Sol, Terra, Luna, DeepSeek, and GLM availability, quotas, account health, and paid-provider fallback remain `UNKNOWN`.
- External Responses/Chat/Anthropic provider adapters are not implemented in this stage; the local server returns route-preview evidence rather than upstream completions.
- Cross-platform service/shim behavior, live Codex catalog injection, and production configuration behavior remain `UNKNOWN`.
- The accidental empty directory `C:/Users/ASUS/Documents/Codex/2026-08-08/codex-soluna-max-token-10/` was created during an early path typo and contains no files; it is outside the project root and not part of delivery.

## Deliverables

- [savetoken-runtime/README.md](../../savetoken-runtime/README.md)
- [savetoken-runtime/package.json](../../savetoken-runtime/package.json)
- [savetoken-runtime/bun.lock](../../savetoken-runtime/bun.lock)
- [savetoken-runtime/tsconfig.json](../../savetoken-runtime/tsconfig.json)
- `savetoken-runtime/src/`
- `savetoken-runtime/tests/`
- `savetoken-runtime/scripts/`
- [savetoken-stage-2-change-manifest.json](savetoken-stage-2-change-manifest.json)
- No external messages, commits, pushes, deployments, or production configuration changes.

## Failures and risks

- The review regression tests initially failed for all three reported defects: Chinese high-risk routing downgraded to Terra, restore removed an unrelated user assignment, and the cancellation binding export was absent. After focused fixes, the full suite passes `22/22`.
- The runtime still has no external provider call. Cancellation is verified at the local request-processing boundary; cancellation behavior across an external provider adapter remains `UNKNOWN` because that adapter is not implemented in Stage 2.
- First privacy scan run failed because Windows `file:` URL pathname handling produced `/C:/...`. A failing privacy test was added, the path logic was moved into `src/evidence/privacy.ts`, and the final privacy scan exits 0.
- The runtime does not make real provider calls. Any claim of successful external invocation, quota savings, quality preservation, or model identity would violate the evidence boundary.
- `node_modules` exists only for local validation and must not be packaged or committed.

## Next action

WAIT_FOR_ACCEPTANCE
