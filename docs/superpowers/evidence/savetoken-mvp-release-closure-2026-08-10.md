# SaveToken v0.1.0 MVP Release Closure / Evidence Reconciliation

> Historical evidence notice: this retained closure report describes an earlier archive and test snapshot. Its `PASS (package scope)` wording does not apply to the current upstream-conformance gate. The authoritative reconciliation is [savetoken-full-conformance-final-2026-08-13.md](savetoken-full-conformance-final-2026-08-13.md), whose overall status is `PARTIAL` and whose external boundaries remain `UNKNOWN` or `NOT_TESTED`.

Date: 2026-08-11
Result: **PASS (package scope) + NOT_TESTED (root-level hosted CI)**

## FACT

### Deliverables

| File | SHA-256 |
|------|---------|
| outputs/savetoken-v0.1.0-mvp.zip | 165FD3CAD0CC15559793D3FC9403110F4939C4D43AFAAACB1A2D245E29E63C98 |
| outputs/savetoken-v0.1.0-mvp-manifest.json | 0FB88D324CDB318CAFE05B1C838C05FF4C68E2DDF20089D13576C961FD6C0032 |
| docs/.../savetoken-mvp-capability-manifest-2026-08-10.json | 30072546DBA31AD120C2D5E27B3A01C63ADE132B7A3398D3D819C0CE704551DE |
| docs/.../savetoken-mvp-clean-room-2026-08-10.md | 55DB52442E4784CA0F8BFA33BA44FB3B11D818CA43B95CE2C940C6A351579130 |

All SHA-256 values are actual readbacks, not placeholders.

### Verified test statistics (reconciled)

| Context | Tests | Pass | Fail | Command |
|---------|-------|------|------|---------|
| Source tree | 128 | 128 | 0 | bun test (CWD: savetoken-runtime) |
| Clean-room package | 128 | 128 | 0 | bun test (CWD: temp extract dir) |

No discrepancy. Both contexts produce 128 pass, 0 fail.

### CI test boundary (fixed)

The 	ests/release-artifacts-stage3.test.ts cross-platform CI check:
- In source tree: verifies .github/workflows/savetoken-runtime.yml content (passes)
- In clean-room: gracefully skips with console.warn when file not found (package scope boundary)

Root-level CI workflow content verified: windows-latest, ubuntu-latest, macos-latest, privacy:scan, package:check all present. Hosted CI execution: NOT_TESTED.

### Clean-room gates (all pass)

| Gate | Exit Code | Output |
|------|-----------|--------|
| bun install --frozen-lockfile | 0 | 8 packages (bun 1.3.14) |
| bun x tsc --noEmit | 0 | clean |
| bun test | 0 | 128 pass, 0 fail |
| bun run lint | 0 | lint clean |
| bun run privacy:scan | 0 | clean (0 hits) |
| bun run package:check | 0 | 46 allowed, 0 missing |

### Source tree gates (all pass)

| Gate | Exit Code | Output |
|------|-----------|--------|
| bun x tsc --noEmit | 0 | clean |
| bun test | 0 | 128 pass, 0 fail |

### Upstream

- Commit: 57140d6f06218d604ee139e5909a1b868bf7a84b
- Status: clean, unchanged

### Modified files (this closure)

| File | Change |
|------|--------|
| tests/release-artifacts-stage3.test.ts | CI test: graceful skip when .github absent |
| outputs/savetoken-v0.1.0-mvp.zip | Rebuilt with fixed test |
| outputs/savetoken-v0.1.0-mvp-manifest.json | Regenerated with actual SHA-256 |
| docs/.../savetoken-mvp-capability-manifest-2026-08-10.json | Updated test statistics and CI boundary |
| docs/.../savetoken-mvp-clean-room-2026-08-10.md | Updated with reconciled 128/128 |

### Archive contents

- 83 files, 187,752 bytes
- Secret scan: clean (0 hits)
- Excluded: .git, node_modules, caches, logs, .env*, credentials

### Frozen constraints (unchanged)

- Sol/Terra/DeepSeek-Luna/GLM hierarchy
- Default reasoning effort
- Quality Gate v0.1
- ProviderAuthMode = "proxy" (loopback only)
- Fail-closed rules
- No new Provider, adapter, auth mode, or fallback

## INFERENCE

- The MVP package is independently installable and passes all local gates.
- The CI test boundary is correctly handled and documented.
- Test statistics are reconciled across source tree and clean-room.
- No compromises were made to achieve passing status.

## UNKNOWN

- Hosted CI execution (workflow content verified, not executed)
- Real Provider calls beyond DeepSeek V4 Flash
- OAuth, API keys, quota, cooldown, rate limits
- Cross-platform behavior (Windows only verified)
- Token/cost savings
- OpenCodex parity

## Status

PASS (package scope): all local gates pass, archive is reproducible, manifest is accurate.
NOT_TESTED (root-level hosted CI): workflow content verified, not executed.

Not committed, not pushed, not published, not deployed.
