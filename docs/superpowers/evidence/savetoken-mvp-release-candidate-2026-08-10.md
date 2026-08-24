# SaveToken v0.1 MVP Release Candidate — Reconciled Evidence

> Historical evidence notice: this retained candidate report predates the current 121-file archive. Its 118-file hashes and 247-test result are superseded by [savetoken-full-conformance-final-2026-08-13.md](savetoken-full-conformance-final-2026-08-13.md). The current overall status is `PARTIAL`; no release action is implied.

Reconciled: 2026-08-13. Overall status: **PARTIAL**. The package gates pass; this is not full OpenCodex parity.

## FACT

| Deliverable | SHA-256 |
|---|---|
| `outputs/savetoken-v0.1.0-mvp.zip` | `689E26C5A956BA7F54939D9BF792F5DCC6DF1BAB50CD4E82B9B62EC68BDCB013` |
| `outputs/savetoken-v0.1.0-mvp-manifest.json` | `2D26E572EEC06F27EBE0325D71581BE2AE873F34C0F173F3473C04B41F7566D9` |

- The archive contains 118 files, exactly matching the 118-file manifest by path and per-file SHA-256.
- Current source gates: typecheck, lint, privacy scan, and package check all exit 0; `bun test` exits 0 with 247 pass, 0 fail, 886 expectations across 62 files.
- Fresh clean-room on Bun 1.3.14: frozen-lockfile installation (8 packages), typecheck, lint, privacy scan, package check all exit 0; package-suite test exits 0 with 247 pass, 0 fail, 881 expectations across 62 files. The root-level CI workflow contract is deliberately skipped in package scope; it accounts for the five-expectation difference.
- Hosted CI was not run. The clean-room package does not include the root workflow and its package-scope test records that boundary.
- Upstream was read only at `57140d6f06218d604ee139e5909a1b868bf7a84b`; no commit, push, publish, deployment, credential read, or real Provider request occurred in this reconciliation.

## INFERENCE

The current archive is locally reproducible within the stated Windows/Bun package boundary. Local tests and the archive do not prove live Provider behavior, native Codex compatibility, cross-platform service behavior, or complete parity.

## UNKNOWN

All external Provider, OAuth, quota, cancellation, hosted CI, native service/shim, native Codex configuration, cross-platform, token-savings, and general-quality claims remain `UNKNOWN` or `NOT_TESTED` as recorded in the current capability manifest.
