# SaveToken Runtime Smoke Matrix

Stage 1 artifact. This is a read-only smoke plan and execution ledger. It separates static evidence from actual runtime tests and does not require credentials, account state, or external provider calls.

Audit date: 2026-08-08  
Upstream baseline: `@bitkyc08/opencodex` `2.11.0`, commit `57140d6f06218d604ee139e5909a1b868bf7a84b`, branch `main`.  
Upstream source manifest SHA-256: `6B1F8A3349F1B788998F95A56A4BD74EDFB1FA8EB52D478B328BA485B3A84410`.

## Status semantics

Each `status` is one of `PRESENT`, `MISSING`, `PARTIAL`, `NOT_TESTED`, or `UNKNOWN`.

- `PRESENT` means the listed static or harmless command evidence was actually captured.
- `NOT_TESTED` means the command was intentionally not run because its prerequisite was unavailable or it could touch live user state.
- `UNKNOWN` means the available local evidence cannot establish the capability or runtime identity.
- A running process, a task name, a configuration entry, or a model catalog row is not health, readiness, successful invocation, fallback, or quality evidence.

## Execution ledger

| ID | Area | Exact command / evidence action | Expected evidence | Actual result | status | Reason / safety boundary |
|---|---|---|---|---|---|---|
| SM-01 | Upstream commit | `git --git-dir work/opencodex-upstream/.git rev-parse HEAD` | Pinned commit `57140d6f06218d604ee139e5909a1b868bf7a84b` | Returned the pinned commit | PRESENT | Read-only Git metadata |
| SM-02 | Upstream clean status | `git --git-dir work/opencodex-upstream/.git --work-tree work/opencodex-upstream status --short` | Empty output | Empty output; `STATUS_LINES=0` | PRESENT | Explicit git-dir/work-tree form was required in this environment |
| SM-03 | Package contract | Read `package.json`; compare version, MIT license, entrypoints, and all 23 scripts against baseline JSON | Exact package metadata and script equality | All comparisons matched | PRESENT | No dependency installation |
| SM-04 | Inventory and baseline | Recount `src`, `tests`, `gui`, `docs-site`, `scripts`, and `structure`; recompute 1,941-entry manifest | Counts and source manifest match baseline | All counts and SHA-256 matched | PRESENT | Static file hashes only |
| SM-05 | Safe CLI identity probe | `ocx --version` | Installed CLI reports its version without starting a service | Exit code 0; `opencodex 2.11.0` | PRESENT | Does not inspect Codex home or provider credentials |
| SM-06 | Bun availability | `Get-Command bun`; `bun --version` | Bun runtime available before any Bun command | `bun=NOT_FOUND`; no Bun version returned | UNKNOWN | Runtime may exist outside PATH; no assumption made |
| SM-07 | Dependency installation | `bun install --frozen-lockfile` from `work/opencodex-upstream` | Lockfile-resolved dependencies installed | Not executed | NOT_TESTED | Bun unavailable; no dependency or upstream mutation permitted |
| SM-08 | Static and unit gates | `bun run typecheck`; `bun run test`; `bun run privacy:scan` | Actual exit codes, logs, duration, and test counts | Not executed | NOT_TESTED | Bun unavailable; prior source reading is not a test result |
| SM-09 | Service health/readiness | `ocx health`; `ocx ready --json`; separate `/healthz` and `/readyz` readback | Health and readiness independently verified | Not executed | NOT_TESTED | No isolated runtime home or test service was started |
| SM-10 | Model catalog | `ocx status`; `GET /v1/models` against an isolated service | Requested catalog, resolved provider, and response evidence | Not executed | UNKNOWN | Local catalog/provider availability not established |
| SM-11 | Explicit provider/model route | Harmless request with an explicit `provider/model` id in an isolated test home | Requested id, resolved provider, completion, and error mapping | Not executed | UNKNOWN | No credential-free compatible runtime was available |
| SM-12 | Subagent visibility | Inspect catalog and run a harmless `ocx agent status --json` / subagent probe in an isolated home | Featured models, selected models, and actual role/model readback | Not executed | NOT_TESTED | Would require runtime setup; catalog presence alone is insufficient |
| SM-13 | Execution-tier fallback | Low-risk request with a controlled Luna/DeepSeek fallback fixture | Fallback reason, chosen model, terminal result, and no silent high-risk downgrade | Not executed | NOT_TESTED | Do not exhaust or damage a paid account; no verified provider fixture available |
| SM-14 | Restore | `ocx restore` against a copied Codex home, followed by file/hash readback | Only marker-owned state removed; native config preserved | Not executed | NOT_TESTED | No restore test against the live Codex home is allowed |
| SM-15 | Privacy evidence | `bun run privacy:scan` plus secret-like scan of generated artifacts | Clean exit and no key/cookie/token/private-state values | Static artifact scan passed; upstream privacy command not run | PARTIAL | Bun unavailable; artifact scan is not a substitute for upstream privacy suite |
| SM-16 | Cross-platform gates | CI/workflow inspection plus Windows/macOS/Linux runtime commands | Platform-specific test results | Not executed | NOT_TESTED | Current host is Windows; other platforms require their own runtime evidence |

## Required evidence schema for future runtime probes

Any later runtime probe must record only redacted metadata:

```json
{
  "requested_model": "provider/model",
  "resolved_provider": "provider-id-or-UNKNOWN",
  "actual_runtime_model": "verified-id-or-UNKNOWN",
  "evidence_status": "PRESENT|MISSING|PARTIAL|NOT_TESTED|UNKNOWN",
  "request_outcome": "not-recorded-in-stage-1-template",
  "fallback_used": false,
  "evidence_valid": true,
  "secrets_recorded": false
}
```

Do not record request bodies, API keys, OAuth state, cookies, tokens, account identifiers, private paths, or real user data.

## Smoke conclusion

Stage 1 has verified the static baseline and the safe CLI version probe. Runtime health, provider availability, model invocation, subagent execution, fallback, restore, full tests, and cross-platform behavior remain explicitly `NOT_TESTED` or `UNKNOWN`.
