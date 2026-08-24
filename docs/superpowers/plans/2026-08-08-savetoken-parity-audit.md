# SaveToken OpenCodex Parity Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Establish an evidence-backed parity matrix between SaveToken and the pinned OpenCodex 2.11.0 runtime before implementing any runtime upgrade.

**Architecture:** Treat OpenCodex as the runtime baseline and SaveToken as the orchestration and quality layer. The audit produces a source-to-test map first; only gaps with a defined contract and regression test become implementation tasks. High-risk routing must fail closed rather than silently falling to a cheaper model.

**Tech Stack:** Bun-native TypeScript, Bun tests, PowerShell on Windows, Markdown/JSON evidence files, Codex Skill metadata.

## Global Constraints

- Use OpenCodex baseline commit `57140d6f06218d604ee139e5909a1b868bf7a84b` and package version `2.11.0`.
- Do not modify `work/opencodex-upstream`; it is a read-only reference clone.
- Preserve the frozen hierarchy: Sol highest difficulty/blocker; Terra medium complexity; Luna/DeepSeek peer execution; GLM last low-risk backup.
- Do not require ChatGPT Pro or Extra High for Plus mode.
- Mark every statement `FACT`, `INFERENCE`, or `UNKNOWN` where evidence is incomplete.
- Do not include keys, OAuth state, cookies, browser state, private paths, or real user data in evidence or source.
- Do not claim parity, successful model invocation, fallback, or quality preservation before the relevant test evidence exists.

---

### Task 1: Capture the upstream baseline

**Files:**
- Read: `work/opencodex-upstream/package.json`
- Read: `work/opencodex-upstream/structure/00_overview.md`
- Read: `work/opencodex-upstream/structure/01_runtime.md`
- Read: `work/opencodex-upstream/structure/02_config-and-codex-home.md`
- Read: `work/opencodex-upstream/structure/03_catalog-and-subagents.md`
- Read: `work/opencodex-upstream/structure/04_transports-and-sidecars.md`
- Read: `work/opencodex-upstream/structure/05_gui-and-management-api.md`
- Read: `work/opencodex-upstream/structure/08_openai-provider-tiers.md`
- Create: `docs/superpowers/evidence/savetoken-upstream-baseline.json`

**Interfaces:**
- Produces the exact upstream commit, package version, source/test/GUI/doc file counts, package scripts, license, and repository cleanliness.

- [ ] **Step 1: Verify the reference clone is clean and pinned**

Run:

```powershell
git -C work/opencodex-upstream status --short
git -C work/opencodex-upstream rev-parse HEAD
```

Expected: empty status and `57140d6f06218d604ee139e5909a1b868bf7a84b`.

- [ ] **Step 2: Record the package contract and source counts**

Read `package.json` and count `src`, `tests`, `gui`, and `docs-site` files with `rg --files`. Store only paths, counts, scripts, version, and license metadata in the JSON evidence file.

- [ ] **Step 3: Review the structure source of truth**

For each structure document, record its owned subsystem and the invariants it says must survive a compatible implementation. Do not copy historical devlog claims into the matrix without confirming them against current source.

- [ ] **Step 4: Validate the evidence file**

Run a JSON parse and SHA-256 hash. Expected: valid UTF-8 JSON, no secret-like values, and a recorded hash.

---

### Task 2: Build the feature parity matrix

**Files:**
- Read: `work/opencodex-upstream/src/`
- Read: `work/opencodex-upstream/tests/`
- Create: `docs/superpowers/evidence/savetoken-opencodex-parity-matrix.md`

**Interfaces:**
- Produces one row per capability with: capability id, upstream source of truth, public behavior, SaveToken owner, existing test, required new test, status, and evidence hash.

- [ ] **Step 1: Add the runtime and lifecycle rows**

Cover CLI entrypoints, proxy lifecycle, service/shim, health/ready, restore, uninstall, `CODEX_HOME`, `OPENCODEX_HOME`, atomic writes, and crash recovery.

- [ ] **Step 2: Add the data-plane rows**

Cover Responses, Chat Completions, Anthropic Messages, streaming, tool calls, cancellation, images, error translation, websocket behavior, web-search sidecar, and vision sidecar.

- [ ] **Step 3: Add the Provider and account rows**

Cover provider registry, live model discovery, explicit `provider/model` routing, default provider, OAuth, API keys, key pools, account pools, quota, cooldown, health, and account affinity.

- [ ] **Step 4: Add the Codex catalog and subagent rows**

Cover catalog backups, visibility, selected models, priorities, `subagentModels`, `injectionModel`, `injectionEffort`, v1/v2 surfaces, effort caps, subagent fallback, and combos.

- [ ] **Step 5: Add the GUI, management, privacy, and release rows**

Cover dashboard routes, authentication, API ownership, logs, usage, privacy scan, package preparation, docs synchronization, and cross-platform CI.

- [ ] **Step 6: Mark each row with evidence status**

Use only `PRESENT`, `MISSING`, `PARTIAL`, `NOT_TESTED`, or `UNKNOWN`. Do not use “probably supported” or “same as upstream” as a status.

---

### Task 3: Map the frozen SaveToken increment

**Files:**
- Read: `SAVETOKEN_SPEC.md`
- Read: `C:/Users/ASUS/.codex/skills/savetoken/SKILL.md`
- Read: `work/opencodex-upstream/src/config.ts`
- Read: `work/opencodex-upstream/src/router.ts`
- Read: `work/opencodex-upstream/src/codex/subagent-model-fallback.ts`
- Read: `work/opencodex-upstream/src/codex/subagent-defaults.ts`
- Read: `work/opencodex-upstream/src/cli/agent.ts`
- Create: `docs/superpowers/evidence/savetoken-routing-gap-matrix.md`

**Interfaces:**
- Produces the exact boundary between upstream runtime parity and SaveToken additions.
- Defines a future pure routing interface without implementing it in this audit:

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

- [ ] **Step 1: Record the hard safety signals**

Architecture, security, permissions, production data, migration, major refactor, cross-module scope, and blocker signals must route at least to Terra and may require Sol. No low-cost worker may clear these signals.

- [ ] **Step 2: Record execution-tier signals**

Text-heavy extraction and classification may prefer DeepSeek; file/tool execution may prefer Luna. These are peer candidates, not quality guarantees.

- [ ] **Step 3: Record fallback boundaries**

Only execution-tier work may fall back between Luna and DeepSeek, then to GLM for low-risk work. Critical work must fail closed if Sol/Terra are unavailable.

- [ ] **Step 4: Define evidence requirements**

Every route decision must be able to report the chosen tier, candidates considered, escalation reason, actual runtime model if known, and `UNKNOWN` when not verified.

---

### Task 4: Create the read-only compatibility smoke plan

**Files:**
- Read: `work/opencodex-upstream/scripts/`
- Read: `work/opencodex-upstream/tests/`
- Create: `docs/superpowers/evidence/savetoken-runtime-smoke-matrix.md`

**Interfaces:**
- Produces commands and expected evidence for service health, model catalog, provider routing, subagent visibility, fallback behavior, restore, and privacy checks.

- [ ] **Step 1: Prepare dependency and static checks**

Run from the upstream reference only when dependencies are available:

```powershell
cd work/opencodex-upstream
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run privacy:scan
```

Record each command, exit code, duration, and whether it was actually executed.

- [ ] **Step 2: Define proxy readiness evidence**

Use `ocx status`, `ocx health`, and `ocx ready --json` where the installed runtime supports them. A running PID alone is insufficient; record `/healthz` and `/readyz` results separately.

- [ ] **Step 3: Define model route evidence**

For each configured model, record the exact requested id, resolved provider, response completion, tool-call behavior, and error mapping. Do not send or record secrets.

- [ ] **Step 4: Define fallback evidence**

Use a harmless low-risk request to verify execution-tier fallback. Do not intentionally exhaust or damage a paid account. High-risk fallback must be verified by configuration inspection and a fail-closed test, not by forcing a real outage.

- [ ] **Step 5: Define restore evidence**

Verify `ocx stop`/restore behavior against a copied Codex home. Never test restore against the only live user configuration.

---

### Task 5: Review the matrix and split implementation work

**Files:**
- Modify: `docs/superpowers/evidence/savetoken-opencodex-parity-matrix.md`
- Modify: `docs/superpowers/evidence/savetoken-routing-gap-matrix.md`
- Modify: `docs/superpowers/evidence/savetoken-runtime-smoke-matrix.md`
- Create: one follow-up plan under `docs/superpowers/plans/` per independent subsystem

**Interfaces:**
- Produces approved subsystem plans for runtime parity, routing, quality gates, and public packaging.

- [ ] **Step 1: Reject unsupported parity claims**

Any row without source and test evidence remains `UNKNOWN`, `MISSING`, `PARTIAL`, or `NOT_TESTED`.

- [ ] **Step 2: Split by subsystem**

Create separate follow-up plans for: runtime/config/lifecycle; providers/adapters; catalog/subagents/fallback; SaveToken routing and quality; GUI/management/docs; cross-platform packaging.

- [ ] **Step 3: Assign one test gate to each plan**

Each follow-up plan must name its focused test, full-suite test, privacy check, and runtime smoke boundary before implementation begins.

- [ ] **Step 4: Stop before implementation if the baseline is not reproducible**

If dependency installation, typecheck, or the upstream test suite cannot run, record the exact blocker and do not claim an implementation-ready parity baseline.

---

## Completion gate for this plan

This audit plan is complete only when the three evidence matrices exist, the upstream baseline is reproducible or explicitly blocked, all rows have a non-vague status, and the next subsystem plans are split. It is not complete merely because the files were created.
