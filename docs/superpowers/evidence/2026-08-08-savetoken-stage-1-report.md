# SaveToken Stage 1 Report

Stage: 1  
Result: PASS

## FACT

- Read the binding project files: `AGENTS.md`, `SAVETOKEN_SPEC.md`, `docs/superpowers/plans/2026-08-08-savetoken-codex-project-plan.md`, and the existing parity audit plan.
- Read the requested upstream structure documents under `work/opencodex-upstream/structure/`.
- No runtime code was written in Stage 1.
- Upstream identity was independently rechecked:
  - package: `@bitkyc08/opencodex`
  - version: `2.11.0`
  - branch: `main`
  - commit: `57140d6f06218d604ee139e5909a1b868bf7a84b`
  - license: `MIT`
  - package entrypoints: `./bin/package-main.mjs`, `./bin/ocx.mjs`, and `./src/index.ts` for the Bun export
  - package scripts: 23; all values matched the baseline artifact
- Upstream inventory matched the baseline artifact:
  - `src=490`
  - `tests=652`
  - `gui=390`
  - `docs-site=399`
  - `scripts=34`
  - `structure=9`
  - hashed manifest entries: `1941`
  - source manifest SHA-256: `6B1F8A3349F1B788998F95A56A4BD74EDFB1FA8EB52D478B328BA485B3A84410`
- `git -C work/opencodex-upstream status --short` returned empty output. The explicit `git --git-dir ... --work-tree ... status --short` fallback also returned empty output.
- `ocx --version` was executed as a harmless identity probe. Actual result: exit code `0`, output `opencodex 2.11.0`.
- The existing parity matrix was rechecked: 53 rows, 238 referenced upstream tokens, zero missing references, zero invalid status values. Static upstream evidence is `PRESENT=52`, `PARTIAL=1`; SaveToken parity remains `MISSING=53` because no SaveToken runtime or test owner exists outside the upstream reference clone.
- Stage 1 artifacts were created and validated:
  - `savetoken-upstream-baseline.json` — SHA-256 `04BC5AB445B9DE1F840109C461809B821CAFF466681A55534CF33120A9BA6D97`
  - `savetoken-opencodex-parity-matrix.md` — SHA-256 `5147830293AA21C4612F9F645337B3715A2213121590CA033E4D00EBA673488D`
  - `savetoken-routing-gap-matrix.md` — SHA-256 `A76A2CEACFE3C1F9230BDF18EE9E524FA8E4EF41E717DBEF8CF36436F52D8494`
  - `savetoken-runtime-smoke-matrix.md` — SHA-256 `8F98FE8F492BFA2BA485AA164DE54DE809C97464C06BF960BDB6B50D4DCB2078`
  - this report — its final SHA-256 is reported in the handoff; it is not embedded in the file to avoid a self-referential hash
- Artifact validation completed: JSON parse succeeded; all matrix status values were limited to `PRESENT`, `MISSING`, `PARTIAL`, `NOT_TESTED`, or `UNKNOWN`; UTF-8 decoding succeeded; secret-like scan returned `0` hits.
- `work/opencodex-upstream` remained unchanged: HEAD stayed at `57140d6f06218d604ee139e5909a1b868bf7a84b`, and status remained empty.

## INFERENCE

- The Stage 1 evidence boundary is satisfied: upstream behavior is mapped to source/test paths, while SaveToken additions are represented as explicit contracts and gaps rather than as implemented parity.
- The routing design is monotonic with respect to risk: high-risk signals enter the Sol/Terra boundary before execution-tier selection; execution fallback is not permitted to clear a high-risk signal; GLM remains low-risk backup only.
- The current workspace is ready for a later implementation stage only as a documented design baseline. It is not evidence that SaveToken runtime parity or automatic routing already exists.

## UNKNOWN

- Actual availability, quota, rate limits, health, and successful invocation of Sol, Terra, Luna, DeepSeek, GLM, or any provider account.
- Actual runtime model identity for a worker or subagent. Configuration, catalog rows, task names, and agent names were not treated as invocation evidence.
- Full upstream typecheck, unit suite, privacy scan, health/readiness, model route, subagent, fallback, restore, and cross-platform results.
- Whether the current local OpenCodex installation supports every upstream surface on this machine.
- The outer SaveToken project directory is not confirmed as a Git repository.

## Deliverables

- `docs/superpowers/evidence/savetoken-upstream-baseline.json`
- `docs/superpowers/evidence/savetoken-opencodex-parity-matrix.md`
- `docs/superpowers/evidence/savetoken-routing-gap-matrix.md`
- `docs/superpowers/evidence/savetoken-runtime-smoke-matrix.md`
- `docs/superpowers/evidence/2026-08-08-savetoken-stage-1-report.md`
- Dependencies added: none.
- Actual commands/probes executed:
  - `git -C work/opencodex-upstream rev-parse HEAD`
  - `git -C work/opencodex-upstream branch --show-current`
  - `git -C work/opencodex-upstream status --short`
  - explicit `git --git-dir ... --work-tree ...` identity/status fallback
  - package, inventory, manifest, JSON, status-enum, path-reference, UTF-8, and secret-like PowerShell validations
  - `ocx --version`
- Commands not executed: `bun install --frozen-lockfile`, `bun run typecheck`, `bun run test`, `bun run privacy:scan`, runtime health/readiness probes, provider/model requests, fallback probes, restore probes, and cross-platform suites.

## Failures and risks

- `Get-Command bun` returned `bun=NOT_FOUND`; both upstream `node_modules` and `gui/node_modules` are absent. Therefore Bun-based tests were not run. This is reported as `NOT_TESTED`, not as a pass.
- The missing SaveToken runtime owner is at the project root: `src/` and `tests/` do not exist outside `work/opencodex-upstream`. This is the implementation gap recorded in all 53 parity rows.
- Runtime smoke operations that could inspect or mutate the live Codex home were not run. Restore evidence must use a copied isolated home in a later stage.
- No upstream file changed. No commit, push, publish, deployment, external message, or production configuration action occurred.

## Next action

WAIT_FOR_ACCEPTANCE
