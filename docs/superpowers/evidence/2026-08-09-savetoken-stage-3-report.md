# SaveToken Stage 3 Report

Stage: 3  
Result: FAIL

## FACT

- Stage 2 was accepted before this Stage 3 implementation began.
- All Stage 3 code changes are confined to `savetoken-runtime/`; `work/opencodex-upstream` was not modified.
- The outer project path is not a Git repository in this environment; branch, HEAD, and project-level diff are therefore `UNKNOWN` / `NOT PRESENT IN REPOSITORY`. Upstream Git status remains empty at commit `57140d6f06218d604ee139e5909a1b868bf7a84b`.
- Added credential-free local contracts for:
  - provider descriptors, auth-reference separation, health/quota/cooldown/affinity eligibility, and explicit low-risk failover;
  - catalog backup/restore, selected/subagent/injection fields, effort caps, subagent fallback, complete combo tier-map validation, and GLM-last ordering;
  - authenticated management API, CLI request dispatch, owned-state restore/uninstall, and platform-specific service plans;
  - sidecar selection, dashboard view model, redacted usage logging, redacted provider error mapping, calibration, package allowlist, and cross-platform CI declaration.
- Added HTTP admission guards: execution routes require server-supplied structured task signals; explicit `provider/model` requests remain the first candidate; readiness requires a healthy adapter matching a declared route; `PRESENT` provider evidence must match the requested runtime model.
- Added the row-by-row [Stage 3 final parity matrix](savetoken-stage3-final-parity-matrix.md) and [capability gap report](savetoken-stage3-gap-report.md).
- Runtime manifest: 64 sorted non-`node_modules` file-path/content-hash entries, SHA-256 `6E557D617483CD40A21BB09EC5EDD0C25B84BD8EEBC02EE0D733D5D168F5E915`.
- `savetoken-runtime/package.json` SHA-256: `20A33872925D2F5E61C2DE4CA05961BBCB317094929AFC0D12C58114524ECA39`.
- `savetoken-runtime/bun.lock` SHA-256: `B9ED3B879245F6EBF5A3586715ADB6FCF70F95CB59A6D2E65F62E67AE3EC78D9`.
- `savetoken-runtime/README.md` SHA-256: `404FB14F6C75A54FD09218DD0B1BC4DCCB3AA67CA1D1B9893C4F02CF894F412A`.
- Final parity matrix SHA-256: `70010E86521EDB878A6420D15EF74463210EEFAFCA458B2A4AE4C23DADEE54EF`.
- Capability gap report SHA-256: `58E4C64D980914B0B95C35BD382D938E40D33B745B2103BB159648B968EA7B69`.
- Cross-platform workflow SHA-256: `12B37783851E24249F10A7EF846522A91651E10FDD31A8A2048CB0736DAB3840`.
- Local verification used Bun 1.3.14 through `savetoken-runtime/node_modules/.bin/bun.exe`; `bun` was not on `PATH`. `node_modules` is excluded local validation state, not a package artifact.

### Actual verification

```text
bun --version           exit 0; 1.3.14
bun run typecheck       exit 0
bun test                exit 0; 74 pass, 0 fail, 182 assertions
bun run lint            exit 0; lint clean
bun run privacy:scan    exit 0; privacy scan clean: 0 hits
bun run package:check   exit 0; 37 allowed, 684 excluded local paths, 0 missing
runtime smoke           12 pass, 0 fail, 34 expect() calls
parity matrix audit     53 rows, 0 invalid statuses; embedded hashes matched recomputation
upstream git status      0 lines; HEAD `57140d6f06218d604ee139e5909a1b868bf7a84b`
```

The smoke tests used isolated temporary homes, separate health/readiness, declared-route readiness mismatch, authenticated management status/catalog/usage, route preview, standard-input execution fail-closed behavior, explicit-route precedence, provider-evidence validation, unknown-provider fail-closed behavior, and local cancellation.

## INFERENCE

- The delivered package is a locally testable contract layer and safe foundation for later provider integration.
- High-risk provider/subagent fallback is fail-closed in the implemented fixture contracts; no local test authorizes silent downgrade. The Sol architecture review independently identified the route-admission, explicit-route, readiness, and evidence boundaries now covered by focused tests.
- The Stage 3 acceptance gate is not satisfied because the remaining OpenCodex surfaces are explicitly partial, missing, or not tested.

## UNKNOWN

- Real OAuth/API-key exchange, live discovery, Provider invocation, runtime model identity, quota/account health, key/account pool persistence, and external cancellation propagation.
- Real Responses/Chat/Anthropic completions, streaming events, tool-call round trips, image/vision/search adapters, WebSocket behavior, and provider error fidelity.
- Native Codex catalog injection, v1/v2 agent surfaces, crash recovery, service/shim installation, rendered GUI behavior, hosted CI execution, and non-Windows runtime behavior.
- No cost, quota-savings, latency, or quality percentage was measured.
- The read-only Sol architecture review did not exercise a real external Provider, hosted CI, install/remove lifecycle, or a production Codex home; those remain UNKNOWN.

## Deliverables

- `savetoken-runtime/src/` Stage 3 contracts and runtime integration.
- `savetoken-runtime/tests/` focused red-green tests plus existing suite.
- `savetoken-runtime/scripts/package-check.ts` and updated `package.json` scripts.
- `savetoken-runtime/README.md`.
- `.github/workflows/savetoken-runtime.yml` cross-platform workflow declaration.
- `docs/superpowers/evidence/savetoken-stage3-final-parity-matrix.md`.
- `docs/superpowers/evidence/savetoken-stage3-gap-report.md`.
- No commits, pushes, deployments, external messages, real Provider calls, or production configuration changes.

## Failures and risks

- Full Stage 3 parity is not delivered; the final matrix contains `PARTIAL`, `MISSING`, and `NOT_TESTED` rows.
- Standard protocol bodies do not carry trusted module/file scope signals by themselves; the runtime therefore fails closed for execution unless its caller supplies server-side `SaveTokenTaskSignals`.
- Native Codex TOML marker restore still lacks content-hash baselines, and owned JSON markers are not a multi-file transaction; later-edit preservation is only established for the hashed JSON path.
- Hosted Windows/macOS/Linux CI has not run; the workflow file is static evidence only.
- Provider and account behavior is fixture-only. Catalog entries and model names are not invocation evidence.
- `node_modules` and other excluded paths are local validation state and are not package artifacts.

## Next action

WAIT_FOR_ACCEPTANCE
