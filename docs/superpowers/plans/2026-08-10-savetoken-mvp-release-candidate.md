# SaveToken v0.1 MVP Release Candidate Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this plan as one bounded release-candidate task. Do not add providers or continue calibration experiments.

**Goal:** Produce a reproducible, privacy-scanned SaveToken v0.1 MVP package containing only the verified automatic-routing core and its explicit quality gate.

**Architecture:** Freeze the current source after D-3 wiring and Quality Gate v0.1. Package the existing runtime, tests, documentation, and evidence allowlist in an isolated release candidate. Verify installation, local gates, ownership-scoped restore/uninstall, and the documented DeepSeek proxy route without adding new Provider adapters or changing the routing hierarchy.

**Tech Stack:** Bun 1.3.14, TypeScript, existing `savetoken-runtime` package scripts, PowerShell isolation, SHA-256 manifests, and the running OpenCodex 2.11.0 evidence already recorded.

## Global Constraints

- Keep Sol/Terra/DeepSeek-Luna/GLM hierarchy and the current global reasoning default unchanged.
- Do not run further real-model calibration requests in this task.
- Do not add providers, auth modes, fallback chains, GUI, service/shim, catalog injection, or Sol/Terra adapters.
- Do not read, print, copy, or persist API keys, OAuth state, cookies, browser state, private paths, or real user data.
- The package must state that OpenCodex parity is incomplete and that real Provider behavior is only verified for the recorded DeepSeek proxy slice.
- Do not commit, push, publish, deploy, migrate, or modify `work/opencodex-upstream`.
- Preserve all existing user changes; if a runtime bug is discovered outside packaging, stop with `BLOCKED` instead of expanding scope.

---

### Task 1: Freeze the MVP capability boundary

**Files:**
- Read: `AGENTS.md`
- Read: `SAVETOKEN_SPEC.md`
- Read: `docs/superpowers/evidence/savetoken-phase-d3-execution-wiring-2026-08-10.md`
- Read: `docs/superpowers/evidence/savetoken-quality-gate-v0-1-report-2026-08-10.md`
- Read: `docs/superpowers/evidence/savetoken-decision-calibration-report-2026-08-10.md`
- Create: `docs/superpowers/evidence/savetoken-mvp-capability-manifest-2026-08-10.json`

**Interfaces:**
- Consumes: verified reports and current parity matrix.
- Produces: an explicit capability manifest with no inferred success.

- [ ] Mark `PRESENT` only for local contracts with tests and recorded evidence: routing policy, DeepSeek proxy route, Responses quality gate, ownership writes, health/readiness, privacy scan, package check, and local lifecycle tests.
- [ ] Mark real Sol/Terra/Luna/GLM invocation, OAuth, quota, cross-platform service, streaming through SaveToken, multi-turn tools, and native Codex injection `UNKNOWN`, `PARTIAL`, or `NOT_TESTED` exactly as evidence supports.
- [ ] Include upstream commit `57140d6f06218d604ee139e5909a1b868bf7a84b` and the D-3/Quality Gate report hashes.
- [ ] State that `qualityEvidence: UNSPECIFIED` is not a strict quality guarantee when the caller supplies no machine-checkable contract.

Expected result: a machine-readable scope boundary that prevents README or package metadata from overstating capability.

### Task 2: Build an isolated release candidate

**Files:**
- Read: `savetoken-runtime/package.json`
- Read: `savetoken-runtime/bun.lock`
- Read: `savetoken-runtime/scripts/package-check.ts`
- Create: `outputs/savetoken-v0.1.0-mvp/`
- Create: `outputs/savetoken-v0.1.0-mvp.zip`
- Create: `outputs/savetoken-v0.1.0-mvp-manifest.json`

**Interfaces:**
- Consumes: the current allowlist and capability manifest.
- Produces: a deterministic archive without runtime state or credentials.

- [ ] Stage only the package allowlist: `src/`, `tests/`, `scripts/`, `README.md`, `LICENSE`, `package.json`, `bun.lock`, `tsconfig.json`, and the capability/usage documentation required for the MVP.
- [ ] Exclude `.git`, `node_modules`, build artifacts, caches, databases, logs, `.env*`, API keys, OAuth state, cookies, browser state, private keys, and symlinks pointing outside the package.
- [ ] Run a secret-pattern scan over the staged directory before archiving.
- [ ] Record every staged file, byte size, and SHA-256 in the manifest.
- [ ] Make the archive reproducible within the limits of the existing PowerShell tooling; if timestamps prevent reproducibility, record that fact rather than claiming bit-for-bit determinism.

Expected result: a clean, inspectable MVP archive and manifest with zero detected secrets.

### Task 3: Verify clean-room installation and local behavior

**Files:**
- Use: `outputs/savetoken-v0.1.0-mvp.zip`
- Create temporary directory outside the repository for extraction.
- Create: `docs/superpowers/evidence/savetoken-mvp-clean-room-2026-08-10.md`

**Interfaces:**
- Consumes: the staged archive.
- Produces: independent installation and test evidence.

- [ ] Extract the archive into a fresh temporary directory with no access to the original `node_modules`.
- [ ] Install exactly from `bun.lock` using Bun 1.3.14 and no extra dependency.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun test`.
- [ ] Run `bun run lint`.
- [ ] Run `bun run privacy:scan`.
- [ ] Run `bun run package:check`.
- [ ] Run fixture-based runtime smoke tests without real credentials or production data.
- [ ] Verify ownership-scoped restore/uninstall in isolated temporary homes and confirm user-created files remain untouched.
- [ ] Do not perform a new real Provider request; cite the existing D-3 evidence for the recorded DeepSeek route and label it as prior evidence.

Expected result: the archive passes all local gates independently of the working tree.

### Task 4: Synchronize MVP documentation

**Files:**
- Modify only if stale: `savetoken-runtime/README.md`
- Create: `docs/superpowers/evidence/savetoken-mvp-usage-2026-08-10.md`

**Interfaces:**
- Consumes: capability manifest and clean-room evidence.
- Produces: copyable local installation, usage, restore, uninstall, and limitation instructions.

- [ ] Document the only recorded real route: SaveToken → local OpenCodex proxy → DeepSeek V4 Flash.
- [ ] Document the explicit structured-quality contract requirement and 422 fail-closed behavior.
- [ ] Document that no-contract responses have `qualityEvidence: UNSPECIFIED`.
- [ ] Document the frozen hierarchy and the fact that default effort is unchanged.
- [ ] Document how to run local tests without credentials.
- [ ] Document restore/uninstall boundaries and the prohibition on production deployment without separate authorization.
- [ ] List all remaining UNKNOWN/PARTIAL/NOT_TESTED capabilities; do not call the package a full OpenCodex replacement.

Expected result: a user can install and inspect the MVP without needing the conversation history to understand its limits.

### Task 5: Final release-candidate report

**Files:**
- Create: `docs/superpowers/evidence/savetoken-mvp-release-candidate-2026-08-10.md`

**Interfaces:**
- Consumes: capability manifest, archive manifest/hash, clean-room results, documentation hash, and upstream status.
- Produces: one final release-candidate verdict.

- [ ] Report `FACT`, `INFERENCE`, and `UNKNOWN` separately.
- [ ] Include archive SHA-256, manifest SHA-256, clean-room commands and exit codes, changed files, and upstream commit/status.
- [ ] State that no commit, push, publication, deployment, or production change occurred.
- [ ] Verdict is `PASS` only for the bounded MVP package, not for full OpenCodex parity.
- [ ] Verdict is `PARTIAL` if any clean-room gate or privacy evidence is missing.
- [ ] Verdict is `BLOCKED` if package contents cannot be safely bounded or a secret scan is inconclusive.

## Non-goals

- No additional real-model calls.
- No global/task-specific reasoning-effort policy change.
- No new Provider or full parity implementation.
- No public package publication or Git operation.

## Final acceptance

The task is complete only when the isolated archive, capability manifest, clean-room report, usage documentation, final report, and SHA-256 values are delivered. The MVP may be called reproducible and locally verified only within its explicitly listed capability boundary.
