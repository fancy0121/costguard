# SaveToken OpenCodex Parity and Automatic Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan stage-by-stage. Complete every task inside a stage without requesting user input. Stop only at the stage acceptance gate.

**Goal:** Build SaveToken as an open-source, quality-gated automatic model-routing system on top of an OpenCodex-compatible runtime, with the frozen Sol/Terra/Luna+DeepSeek/GLM hierarchy.

**Architecture:** SaveToken has two separable layers. The runtime layer reproduces the verified OpenCodex provider, configuration, routing, catalog, transport, service, management, privacy, and restore surfaces. The orchestration layer classifies tasks, selects the least expensive verified model that satisfies the task risk, escalates on uncertainty, and independently validates the result. No routing decision may reduce the acceptance standard.

**Tech Stack:** Bun, TypeScript, ES modules, TOML/Codex-home integration, HTTP/SSE and optional WebSocket transports, provider adapters, CLI/GUI/management API, and repository-native tests inherited or adapted from the OpenCodex baseline.

## Global Constraints

- The binding contract is `SAVETOKEN_SPEC.md`; the project rules are in `AGENTS.md`.
- Frozen hierarchy: Sol for highest difficulty, architecture, security, major refactor, or genuine blockers; Terra for medium-complexity design and bounded multi-file work; Luna and DeepSeek as the peer execution tier; GLM only as the final low-risk backup after other verified routes are unavailable.
- Sol must never be used for routine batch work, and high-risk work must never be silently downgraded.
- ChatGPT Plus does not imply Pro or Extra High; actual model access and route health must be verified at runtime.
- Every report must separate `FACT`, `INFERENCE`, and `UNKNOWN`.
- Do not modify `work/opencodex-upstream`; it is the read-only parity reference.
- Do not read, copy, print, package, or commit API keys, OAuth state, cookies, browser state, private configuration, or real user data.
- Do not claim OpenCodex parity until the relevant implementation and tests pass for the capability being reported.
- Do not commit, push, publish, deploy, migrate databases, or change production configuration.
- During each stage, Codex works autonomously and does not ask the user for confirmation. If a hard external blocker prevents safe progress, stop at the stage gate and report the blocker as `UNKNOWN` rather than weakening the quality bar.

---

## Stage 1: Evidence, Baseline, and Frozen Routing Contract

**Stage objective:** Establish a reproducible OpenCodex baseline and a complete SaveToken gap map before runtime code is written.

**Allowed changes:** Evidence and plan files under `docs/superpowers/evidence/` and `docs/superpowers/plans/` only. Do not create runtime code in this stage.

**Inputs:** `AGENTS.md`, `SAVETOKEN_SPEC.md`, `docs/superpowers/plans/2026-08-08-savetoken-parity-audit.md`, and the read-only clone at `work/opencodex-upstream`.

### Stage 1 tasks

- Confirm upstream package version, commit, branch, license, file inventory, entrypoints, scripts, structure documents, and clean status.
- Confirm the baseline JSON parses and its recorded commit/license hashes match the upstream clone.
- Build the capability matrix for runtime, data plane, providers/accounts, catalog/subagents, GUI/API/privacy, packaging, and cross-platform behavior.
- Build the routing-gap matrix with typed decisions for `sol`, `terra`, `execution`, and `glm-backup`.
- Record which routing signals are hard safety signals, which are execution-tier signals, and which conditions require escalation.
- Run only harmless static validation and record all unexecuted runtime tests as `NOT_TESTED`.
- Produce a follow-up implementation plan for each runtime subsystem without modifying the upstream reference.

**Required artifacts:**

- `docs/superpowers/evidence/savetoken-upstream-baseline.json`
- `docs/superpowers/evidence/savetoken-opencodex-parity-matrix.md`
- `docs/superpowers/evidence/savetoken-routing-gap-matrix.md`
- `docs/superpowers/evidence/savetoken-runtime-smoke-matrix.md`

### Stage 1 acceptance gate

Codex must stop and report only after all checks below are complete:

- All four artifacts exist and parse where applicable.
- Upstream commit, branch, clean status, package version, and license hash are independently rechecked.
- Every matrix row has an allowed status and an exact source/test path or an explicit `UNKNOWN` reason.
- The frozen hierarchy is represented without implicit fallback from Sol/Terra to a cheaper tier.
- No runtime or upstream files were modified.
- No secret-like value was included in the evidence artifacts.
- The report includes artifact SHA-256 values and lists `FACT`, `INFERENCE`, and `UNKNOWN` separately.

Only after this gate is accepted may Stage 2 begin.

---

## Stage 2: OpenCodex-Compatible Runtime and SaveToken Routing Core

**Stage objective:** Implement the minimum complete local runtime and routing core needed to execute and validate SaveToken decisions without reducing quality.

**Allowed changes:** New or modified runtime, routing, configuration, tests, and documentation files inside the SaveToken project. The upstream clone remains read-only.

**Runtime layout:**

- `savetoken-runtime/src/` owns the Bun/TypeScript runtime.
- `savetoken-runtime/src/config/` owns effective home, atomic writes, ownership markers, and restore boundaries.
- `savetoken-runtime/src/providers/` owns provider registry, discovery, credentials by reference, health, quota, and adapters.
- `savetoken-runtime/src/routing/` owns task classification, tier decisions, escalation, fallback boundaries, and evidence.
- `savetoken-runtime/src/codex/` owns catalog projection, subagent settings, Codex-home injection, and restoration.
- `savetoken-runtime/src/server/` owns Responses, Chat Completions, Anthropic Messages, streaming, tool calls, cancellation, and management admission.
- `savetoken-runtime/tests/` owns unit, contract, privacy, and integration tests for every implemented surface.
- `docs/superpowers/evidence/` stores generated validation reports; it never stores credentials.

### Stage 2 tasks

1. Create the Bun/TypeScript package and a dependency lockfile using only dependencies justified by the upstream baseline.
2. Implement configuration resolution with explicit `CODEX_HOME` preservation, separate SaveToken state, atomic writes, marker ownership, and restore that removes only marker-owned state.
3. Implement the provider registry and explicit `provider/model` identity without persisting resolved secrets.
4. Implement health, readiness, quota-unknown, cooldown, and provider-failure states as distinct typed values.
5. Implement the pure routing interface:

```ts
type SaveTokenTier = "sol" | "terra" | "execution" | "glm-backup";

type SaveTokenTaskSignals = {
  text: string;
  filesChanged?: number;
  modulesTouched?: number;
  hasSecurityOrPermissionImpact?: boolean;
  hasProductionOrMigrationImpact?: boolean;
  isBatchOrRepetitive?: boolean;
  isToolOrFileExecution?: boolean;
  blocker?: boolean;
};

type SaveTokenRouteDecision = {
  tier: SaveTokenTier;
  candidates: string[];
  escalationReasons: string[];
  failClosed: boolean;
};
```

6. Make hard safety signals route to Sol or Terra before execution-tier consideration.
7. Make clear bounded work prefer Luna for file/tool execution and DeepSeek for text-heavy extraction/classification.
8. Make GLM available only after verified unavailability of the other routes and only for low-risk work.
9. Implement escalation on ambiguity, contradiction, scope drift, low confidence, provider failure, or test failure.
10. Implement the primary Responses bridge plus the required Chat Completions and Anthropic compatibility boundaries, streaming terminal states, tool-call preservation, cancellation, and error redaction.
11. Add catalog projection and subagent settings without treating a visible model entry as proof of successful invocation.
12. Add contract tests before implementation for routing monotonicity, fail-closed behavior, explicit route precedence, provider isolation, restore ownership, and privacy redaction.
13. Run typecheck, lint, unit tests, contract tests, and privacy scan after each bounded subsystem.

### Stage 2 acceptance gate

Codex must stop and report only after all checks below are complete:

- The runtime starts in an isolated test home without modifying the real Codex home.
- `status`, `health`, and `ready` are distinct and tested.
- Explicit `provider/model` routing works; default-provider fallback works only when explicit routing is absent.
- Sol/Terra work cannot silently fall through to Luna, DeepSeek, or GLM.
- Execution-tier fallback is observable and tested.
- Ambiguous or high-risk tasks fail closed or escalate.
- Responses, streaming, tool calls, cancellation, and compatibility error mapping pass the implemented contract tests.
- Configuration restore preserves unrelated user edits in the isolated test home.
- Typecheck, lint, tests, and privacy scan pass, or each failure is recorded with exact command output and no false success claim.
- A stage report includes changed files, dependencies, test commands, hashes, assumptions, risks, and unverified items.

Only after this gate is accepted may Stage 3 begin.

---

## Stage 3: Full Surface Parity, Packaging, and Open-Source Release Readiness

**Stage objective:** Complete the remaining OpenCodex-compatible surfaces and prove that SaveToken is installable, removable, privacy-safe, and usable across supported platforms without hidden quality loss.

**Allowed changes:** Runtime extensions, CLI, GUI, management API, service/shim, release scripts, documentation, fixtures, and cross-platform tests inside the SaveToken project.

### Stage 3 tasks

1. Complete provider adapters, OAuth/API-key separation, account/key pools, quota, cooldown, health, affinity, and failure boundaries using credential-free fixtures.
2. Complete catalog backup/restore, selected models, subagent model lists, injection model/effort caps, multi-agent surfaces, and combo failover.
3. Complete management API and GUI surfaces with independent management/data-plane authentication and route ownership tests.
4. Complete CLI lifecycle, service/shim ownership, start/stop/status/ready/restore/uninstall behavior, and native Codex usability after removal.
5. Complete optional sidecars for web search, vision, and images with explicit capability selection and fail-closed degradation.
6. Add package preparation, release allowlists, privacy scan, documentation synchronization, and no-secret repository hygiene tests.
7. Add Linux, macOS, and Windows CI coverage for runtime, service, packaging, privacy, restore, and routing behavior.
8. Run a calibrated sample of real-but-non-sensitive tasks through each tier, record measured behavior separately from expectations, and verify that quality gates produce equivalent acceptance outcomes.
9. Produce an install/uninstall guide that does not require ChatGPT Pro and does not claim provider availability without a runtime check.
10. Produce a final parity report that lists every matrix row as verified, partial, missing, not tested, or unknown.

### Stage 3 acceptance gate

Codex must stop and report only after all checks below are complete:

- CLI, GUI, management API, service/shim, runtime, provider, catalog, subagent, sidecar, restore, uninstall, privacy, and cross-platform surfaces have explicit evidence.
- Install and uninstall are repeatable in an isolated environment.
- Removing SaveToken leaves native Codex usable and preserves later user edits.
- No credential, OAuth state, cookie, browser state, or real user data is present in the package or evidence.
- The complete relevant test matrix passes, with all unavailable external routes clearly marked `UNKNOWN`.
- The final report distinguishes implementation facts from quality judgments and unresolved unknowns.
- No commit, push, publication, deployment, production configuration change, or database migration is performed without a later explicit authorization.

## Execution Protocol

- Codex executes one stage at a time in the current project.
- Codex does not ask the user questions or request interim approval inside a stage.
- Codex does not use external ChatGPT Pro by default; this project is designed for ChatGPT Plus and verified local routes.
- At each gate Codex stops, reports evidence, and waits for the user's acceptance before starting the next stage.
- If a test fails, Codex fixes it within the current stage when the fix is local and safe; otherwise it stops with the exact blocker.
- A stage is not accepted because files were created. It is accepted only when the gate evidence is complete.
