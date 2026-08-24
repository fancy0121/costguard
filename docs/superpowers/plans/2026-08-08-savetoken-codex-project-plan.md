# SaveToken Codex Project Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execute one stage at a time. Do not request user input inside a stage. Stop only at the written acceptance gate for that stage.

**Goal:** Create an open-source SaveToken system that reproduces the verified OpenCodex capabilities and adds quality-preserving automatic routing across Sol, Terra, Luna, DeepSeek, and GLM.

**Architecture:** OpenCodex-compatible runtime is the execution foundation. SaveToken is an additional orchestration layer that classifies task risk, selects the least expensive verified model that can safely complete the work, escalates on uncertainty, and independently validates the result. Runtime parity and routing quality are separate acceptance dimensions.

**Tech Stack:** Bun, TypeScript, ES modules, TOML/Codex-home integration, HTTP/SSE, optional WebSocket, provider adapters, CLI/GUI/management API, and repository-native tests.

## 1. Project facts and evidence boundary

### FACT

- The binding project rules are in `AGENTS.md`.
- The binding SaveToken routing contract is in `SAVETOKEN_SPEC.md`.
- The OpenCodex read-only reference is `work/opencodex-upstream`.
- The recorded OpenCodex reference is package `2.11.0`, commit `57140d6f06218d604ee139e5909a1b868bf7a84b`, branch `main`, with a clean upstream status.
- Existing evidence artifacts are:
  - `docs/superpowers/evidence/savetoken-upstream-baseline.json`
  - `docs/superpowers/evidence/savetoken-opencodex-parity-matrix.md`
- The outer SaveToken project directory is not currently confirmed as a Git repository.

### INFERENCE

- Full parity requires a runtime layer plus a SaveToken orchestration layer; a Skill file alone cannot provide OpenCodex's proxy, adapters, service, catalog, GUI, and management API.
- The first implementation should be evidence-driven and incremental rather than copying unverified behavior into production paths.

### UNKNOWN

- Whether every configured provider is currently callable.
- The real quota, rate limits, and model availability of Sol, Terra, Luna, DeepSeek, and GLM accounts.
- Whether the current local OpenCodex installation supports every upstream surface on this machine.
- Cross-platform behavior until the relevant tests actually run.

Unknowns must remain explicitly labeled. Codex must not fill them with assumptions, simulations, screenshots, catalog entries, or model names.

## 2. Frozen routing contract

```text
Sol       = highest difficulty, architecture, security, major refactor, or genuine blocker
Terra     = medium-complexity design, code mapping, test design, and bounded multi-file work
Luna      = ordinary file/tool execution and bounded implementation
DeepSeek  = ordinary text-heavy extraction, classification, and repetitive processing
GLM       = final low-risk backup only after other verified routes are unavailable
```

Rules:

- Sol is never spent on routine batch work.
- Sol/Terra work never silently falls through to Luna, DeepSeek, or GLM.
- Luna and DeepSeek are peer execution routes, not quality-reduction routes.
- GLM cannot receive security, production, migration, architecture, or unresolved-blocker work.
- Ambiguity, contradiction, scope drift, low confidence, provider failure, or test failure causes escalation or fail-closed behavior.
- A model shown in a catalog or configuration is not evidence that it was successfully invoked.
- ChatGPT Plus does not establish Pro or Extra High availability; actual runtime access must be tested.

## 3. Non-goals and authority limits

- Do not claim complete OpenCodex parity before the parity matrix is implemented and verified.
- Do not modify `work/opencodex-upstream`.
- Do not read, store, print, or package API keys, OAuth state, cookies, browser state, private configuration, or real user data.
- Do not commit, push, publish, deploy, migrate databases, alter production configuration, or enable production features.
- Do not call external ChatGPT Pro by default.
- Do not replace a failed test with a code-reading claim, a simulated result, or a provider catalog entry.

## 4. Three-stage delivery model

Each stage is a closed execution batch. Codex completes all tasks in the stage without asking the user questions, then stops at the acceptance gate and produces the required report. The next stage starts only after explicit acceptance of the previous report.

---

## Stage 1 — Baseline, parity evidence, and routing design

### Objective

Convert the current OpenCodex reference and frozen SaveToken rules into reproducible evidence and implementation contracts. No runtime code is written in this stage.

### Codex tasks

1. Read `AGENTS.md`, `SAVETOKEN_SPEC.md`, the existing parity audit plan, and the read-only upstream structure documents.
2. Recheck upstream branch, commit, clean status, package version, license, entrypoints, scripts, and inventory.
3. Validate `savetoken-upstream-baseline.json` against the upstream clone.
4. Audit all parity rows and classify each as `PRESENT`, `MISSING`, `PARTIAL`, `NOT_TESTED`, or `UNKNOWN`.
5. Create `docs/superpowers/evidence/savetoken-routing-gap-matrix.md`.
6. Create `docs/superpowers/evidence/savetoken-runtime-smoke-matrix.md`.
7. Record exact commands, outputs, hashes, assumptions, and unverified items.

### Stage 1 deliverables

- Updated or verified `savetoken-upstream-baseline.json`.
- Verified `savetoken-opencodex-parity-matrix.md`.
- `savetoken-routing-gap-matrix.md`.
- `savetoken-runtime-smoke-matrix.md`.
- A Stage 1 report under `docs/superpowers/evidence/`.

### Stage 1 acceptance gate

Pass only if:

- All deliverables exist and parse where applicable.
- Upstream identity and clean status are independently rechecked.
- Every capability has exact source/test evidence or an explicit unknown reason.
- Routing rules cannot silently downgrade high-risk work.
- No upstream files changed.
- No secret-like value entered an artifact.
- The report separates `FACT`, `INFERENCE`, and `UNKNOWN`.

If any condition fails, stop and report the exact failure. Do not begin Stage 2.

---

## Stage 2 — Runtime foundation and automatic routing core

### Objective

Build the smallest testable SaveToken runtime that can safely resolve configuration, route verified provider/model identities, execute core requests, and enforce the frozen quality rules.

### Planned project boundaries

- `savetoken-runtime/src/config/`: effective homes, atomic writes, ownership markers, restore.
- `savetoken-runtime/src/providers/`: registry, discovery, adapter boundaries, health, quota, and credentials by reference.
- `savetoken-runtime/src/routing/`: classification, tier decisions, escalation, fallback, and evidence.
- `savetoken-runtime/src/codex/`: catalog projection, subagent configuration, Codex-home injection, restore.
- `savetoken-runtime/src/server/`: Responses, Chat Completions, Anthropic Messages, streaming, tools, cancellation, and management admission.
- `savetoken-runtime/tests/`: unit, contract, privacy, and integration tests.

### Required routing interface

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

### Codex tasks

1. Create the Bun/TypeScript runtime package and lockfile using only justified dependencies.
2. Implement isolated configuration resolution and atomic ownership-scoped writes.
3. Implement explicit `provider/model` identity, default-provider fallback, health, readiness, quota-unknown, cooldown, and provider-failure states.
4. Implement pure routing decisions and tests for safety monotonicity, execution-tier selection, escalation, and fail-closed behavior.
5. Implement the core Responses bridge and the required compatibility boundaries for Chat Completions and Anthropic Messages.
6. Implement streaming terminal states, tool-call preservation, cancellation, error redaction, and catalog projection.
7. Run typecheck, lint, unit tests, contract tests, and privacy scan in an isolated test home.

### Stage 2 deliverables

- Testable SaveToken runtime foundation.
- Automatic routing core with typed decisions and observable fallback.
- Core protocol and configuration tests.
- Isolated runtime smoke report.
- Stage 2 change manifest, dependency list, test results, hashes, assumptions, risks, and unknowns.

### Stage 2 acceptance gate

Pass only if:

- Runtime starts in an isolated home without changing the real Codex home.
- Health and readiness are distinct and tested.
- Explicit routes work and default fallback is limited to requests without explicit routes.
- High-risk tasks cannot silently downgrade.
- Ambiguous tasks escalate or fail closed.
- Core protocol, streaming, tools, cancellation, restore, and privacy tests pass.
- Any unavailable provider is reported as `UNKNOWN`, not treated as healthy.

If any condition fails, stop and report the exact command, error, file, and constraint. Do not begin Stage 3.

---

## Stage 3 — Full surface parity, packaging, and release readiness

### Objective

Complete and verify the remaining OpenCodex-compatible surfaces and produce a safe, installable, removable open-source SaveToken package.

### Codex tasks

1. Complete provider adapters, OAuth/API-key separation, account/key pools, quota, cooldown, health, affinity, and failover using credential-free fixtures.
2. Complete catalog backup/restore, selected models, subagent models, effort caps, multi-agent surfaces, and combos.
3. Complete CLI, GUI, management API, service/shim, status/ready, restore, and uninstall behavior.
4. Complete optional image, vision, and web-search sidecars with explicit capability selection and safe degradation.
5. Add privacy scanning, package allowlists, documentation synchronization, and cross-platform CI.
6. Run a calibrated non-sensitive sample through each route and compare acceptance outcomes, not just speed or token usage.
7. Produce the final parity report and installation/removal documentation.

### Stage 3 deliverables

- Complete runtime/CLI/GUI/API/service package or an explicit capability-by-capability gap report.
- Cross-platform and privacy validation evidence.
- Install, restore, and uninstall instructions.
- Final parity matrix with every row marked verified, partial, missing, not tested, or unknown.
- Final cost/quality report that does not claim unsupported savings or quality percentages.

### Stage 3 acceptance gate

Pass only if:

- Every claimed OpenCodex capability has implementation and test evidence.
- Install, restore, and uninstall are repeatable in isolation.
- Native Codex remains usable after SaveToken removal.
- No credential or private user state is present in the package or evidence.
- Relevant tests, privacy checks, and cross-platform checks pass.
- All unavailable routes and unverified behavior remain explicitly labeled `UNKNOWN`.
- No release or deployment action occurred without separate authorization.

## 5. Required report format at every gate

```text
Stage: <1|2|3>
Result: PASS | FAIL | BLOCKED

FACT:
- verified repository facts
- exact commands and outputs
- changed files and hashes

INFERENCE:
- judgments derived from the verified facts

UNKNOWN:
- unavailable provider behavior
- unexecuted tests
- unverified platform or quota behavior

Deliverables:
- file list
- dependency list
- test list

Failures and risks:
- exact file/location
- reproduction command
- violated constraint

Next action:
- WAIT_FOR_ACCEPTANCE
```

## 6. Codex handoff instruction

Execute this plan from the current SaveToken project. Start with Stage 1 only. Work autonomously until the Stage 1 acceptance gate. Do not ask questions, do not modify `work/opencodex-upstream`, do not invent missing facts, and do not begin Stage 2. At the gate, stop and return the required report format. Continue to later stages only after the user explicitly accepts the preceding stage.
