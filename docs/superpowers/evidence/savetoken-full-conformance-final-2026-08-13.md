# SaveToken Full Conformance Evidence — 2026-08-13 Reconciliation

## Overall status: PARTIAL

This report supersedes older counts in this directory. It records a local Windows/Bun evidence run only. It does not claim complete OpenCodex parity, a provider-quality guarantee, token savings, a ChatGPT Pro replacement, or hosted CI execution.

## FACT

### Boundaries

- The only edited workspace was `C:\Users\ASUS\Documents\Codex\2026-08-08\codex-sol-luna-max-token-10`.
- OpenCodex upstream was read-only: version `2.11.0`, commit `57140d6f06218d604ee139e5909a1b868bf7a84b`, branch `main`, and empty `git status --short` output.
- No default `CODEX_HOME`, credential, OAuth state, cookie, token, private key, browser state, production data, or upstream file was read or written.
- No real Provider request, commit, push, publish, deployment, or release occurred in this run.

### Local changes covered by this reconciliation

- `savetoken-runtime/src/providers/discovery.ts` implements bounded, fixed-path `GET /v1/models` discovery only for an explicitly configured loopback URL. It projects only configured allowlisted routes, refuses malformed, ambiguous, non-loopback, oversized, and failed responses, persists only owned route-ID/timestamp cache metadata, and does not change readiness.
- `savetoken-runtime/src/providers/route.ts` resolves bare models only when one configured provider owns the model. Omitted model selection requires an explicit valid `defaultProvider`; runtime startup rejects an explicitly invalid default instead of relying on object insertion order.
- `savetoken-runtime/src/server/runtime.ts` validates persistent telemetry before writing `runtime.json`, so an unowned telemetry file cannot leave newly created runtime state. Usage and debug entries persist only redacted metadata across isolated restart.
- Isolated `CODEX_HOME` lifecycle uses the real management `install`, `sync`, `restore`, and `uninstall` entrypoints. Its managed root TOML block has pre/post/block hashes, a journal, conservative format rejection, CRLF preservation, and refuses later user edits rather than deleting them.
- Catalog projection accepts explicit selected/subagent/injection/effort choices, rejects invalid effort and non-execution combos before catalog write, and never invents omitted choices.
- The local three-protocol Quality Gate normalizes protocol-native Chat/Anthropic JSON and tool outputs for the existing bounded validator. Invalid explicit schemas fail before adapter dispatch; structured streaming is fail-closed because full terminal validation is unavailable.
- Completed fixture Responses streams record only explicitly parsed `response.created` plus `response.output_item.done(function_call)` IDs, enabling one strict tool-output continuation. Missing terminal or cancellation does not create this state; stream inspection stops at 256 KiB and emits a fail-closed error rather than retaining an unbounded transcript.
- Local sidecar/WebSocket facade rejects unknown capabilities and top-level `savetoken*` fields before adapter invocation. Management callback exceptions and CLI malformed startup configuration have stable redacted fail-closed errors.
- Trusted proxy base URLs allow only a pure loopback HTTP origin; path, user-info, query, fragment, and invalid timeout input fail before dispatch. A bounded proxy timeout produces a stable redacted failure. Anthropic SSE requires explicit `message_stop`; an intermediate `stop_reason` at EOF remains fail-closed.
- Owned-state single and batch writes reject any resolved reparse point (symlink/junction) before staging, and batch journal recovery rejects a journal target that traverses a transaction-root junction before writing any `.owner` file (`owned-batch-journal-invalid`).
- Uninstall traversal skips reparse-point entries and never follows a junction out of the managed home, so owned state behind a home junction is never removed.
- A new `tests/codex-catalog-subagent-conformance.test.ts` locks the isolated catalog projection contract for subagent-only models and fail-closed subagent entries.

### Actual commands and outcomes

| Context | Command | Exit | Result |
|---|---|---:|---|
| Source tree | `bun test` | 0 | 295 pass, 0 fail, 1014 expectations, 71 files |
| Source tree | `bun run typecheck` | 0 | clean |
| Source tree | `bun run lint` | 0 | `lint clean` |
| Source tree | `bun run privacy:scan` | 0 | `privacy scan clean: 0 hits` |
| Source tree | `bun run package:check` | 0 | 129 allowed, 657 excluded, 0 missing |
| Isolated focused conformance | protocol/config/CLI/provider-cache/sidecar focused suites | 0 | Each recorded command exited 0; detailed per-command results are preserved in the evidence run history, while source-tree and clean-room totals above are the authoritative whole-suite counts. |
| Fresh clean-room | `bun install --frozen-lockfile` (Bun 1.3.14) | 0 | 8 packages installed |
| Fresh clean-room | manifest entry/hash comparison | 0 | 128 extracted files exactly match manifest paths, sizes, and SHA-256 values |
| Fresh clean-room | `bun run typecheck; bun test; bun run lint; bun run privacy:scan; bun run package:check` | 0 | 295 pass, 0 fail, 1009 expectations; lint/privacy/package all clean |

The five-expectation source/clean-room difference is one package-boundary CI-workflow test: `.github` is intentionally outside the archive and the test prints an explicit package-scope skip. It is not treated as hosted-CI execution.

### Archive and reproducible artifacts

| File | SHA-256 |
|---|---|
| `outputs/savetoken-v0.1.0-mvp.zip` | `3BD36D5C694AFF392BC094E6ED66694CEB376A168126C0F0CB1CD8ED48786971` |
| `outputs/savetoken-v0.1.0-mvp-manifest.json` | `E8B2BD76FB7772A1160335A0291FFE4753C6DB767F1A0DD4AFDA099307C76FF3` |

The manifest records 129 files and 489,475 bytes. The archive was rebuilt from the package allowlist before the clean-room check.

### This reconciliation's modified implementation and test files

| File | Purpose |
|---|---|
| `savetoken-runtime/src/server/runtime.ts` | explicit default validation; telemetry-before-state startup ordering; authenticated discovery entrypoint |
| `savetoken-runtime/src/providers/discovery.ts` | bounded loopback allowlisted model discovery |
| `savetoken-runtime/src/usage/log.ts` | owned, validated, redacted persistent usage metadata |
| `savetoken-runtime/src/usage/debug.ts` | owned, validated, redacted persistent debug metadata |
| `savetoken-runtime/tests/provider-discovery-contract.test.ts` | fixed path, loopback, ambiguity, redaction, readiness, invalid-default contracts |
| `savetoken-runtime/tests/usage-debug-persistence-e2e.test.ts` | restart persistence and no-side-effect unowned telemetry rejection |
| `savetoken-runtime/src/server/quality.ts` | protocol-native structured response/tool normalization and schema fail-closed parsing |
| `savetoken-runtime/src/sidecars/capabilities.ts` | capability and internal-field admission boundary |
| `savetoken-runtime/src/server/management.ts` | redacted callback exception boundary and control-plane HTTP mapping |
| `savetoken-runtime/src/service/lifecycle.ts` | runtime platform/action allowlist for non-executed plans |
| `savetoken-runtime/src/providers/opencodex-proxy.ts` | pure loopback origin, bounded proxy timeout, and stable redacted timeout result |
| `savetoken-runtime/src/server/protocol.ts` | explicit Anthropic `message_stop` SSE terminal requirement |
| `savetoken-runtime/tests/protocol-stream-cancel-conformance.test.ts` | stream terminal/cancel/quality closure and Responses stream tool continuation |
| `savetoken-runtime/tests/opencodex-proxy-stage3.test.ts` | fixed origin shape and timeout fail-closed contracts |
| `savetoken-runtime/tests/management-api-security-e2e.test.ts` | management exception redaction |
| `savetoken-runtime/tests/provider-discovery-cache-e2e.test.ts` | discovery cache ownership/metadata/readiness boundary |
| `savetoken-runtime/tests/service-shim-contract.test.ts` | non-executed service/shim runtime allowlist |
| `savetoken-runtime/tests/web-search-sidecar-conformance.test.ts` | bounded local web-search facade contract |
| `savetoken-runtime/tests/vision-sidecar-conformance.test.ts` | bounded local vision facade contract |
| `savetoken-runtime/tests/sidecar-permission-failclosed.test.ts` | internal-field rejection before adapter invocation |
| `savetoken-runtime/src/config/homes.ts` | owned-state single/batch/recovery reparse-point (junction) rejection before any `.owner` write |
| `savetoken-runtime/tests/config-ownership-stage3.test.ts` | transaction-root and recovery-journal junction escape contracts |
| `savetoken-runtime/src/config/lifecycle.ts` | uninstall walk reparse-point skip (never follow a junction out of the home) |
| `savetoken-runtime/tests/codex-catalog-subagent-conformance.test.ts` | isolated catalog projection conformance for subagent-only and fail-closed subagent entries |
| `savetoken-runtime/scripts/verify-release-manifest.ts` | reusable archive-manifest entry-for-entry verification |

### Recomputable file checksums

| File | SHA-256 |
|---|---|
| `savetoken-runtime/src/server/runtime.ts` | `78D454D666E95C8771144670979F5EF5257A770F25F6B827A06F1C654EBB99C2` |
| `savetoken-runtime/src/providers/discovery.ts` | `168EB8A531D015351888662A17DD5EF718A9B09127027975640DB76319BD94F8` |
| `savetoken-runtime/src/providers/route.ts` | `F87592F83E08744783DC5D03FD5009D4469B30045A69BA5C8FD18A53DB8B206C` |
| `savetoken-runtime/src/usage/log.ts` | `A1DE1556574691A80F34C521F69F68C1F80C8F5123CBBC9558D0D13F3C88BC6A` |
| `savetoken-runtime/src/usage/debug.ts` | `3DEBD7E4A6CB0EEFDF372937280868D4F52C13C27FC6968B989A3A8DF4C95D81` |
| `savetoken-runtime/tests/provider-discovery-contract.test.ts` | `2C73423AD9D494D5883CA79FCF7AE1F1FAEE0E3F12C94EEAF1B468B0C150E2B8` |
| `savetoken-runtime/tests/usage-debug-persistence-e2e.test.ts` | `45932B3191A4EC7722643022B39E5071A3C2284A95322AA669714DEE34BDB6C5` |

## INFERENCE

- SaveToken has stronger local, isolated contracts for default routing, discovery boundaries, telemetry ownership, and configuration lifecycle. This is not evidence that native Codex consumes the managed configuration or that any external provider is available.
- The MVP archive is reproducible at its declared package boundary on this Windows/Bun 1.3.14 environment. It is not cross-platform or hosted-CI evidence.

## UNKNOWN / NOT_TESTED / PARTIAL

- `PARTIAL`: all nine upstream conformance rows remain incomplete; the current row-level reasons are in `savetoken-upstream-conformance-matrix-2026-08-13.json` (eight `PARTIAL`, one `NOT_TESTED`).
- `UNKNOWN`: current live availability and identity of Sol, Terra, Luna, DeepSeek, and GLM; OAuth/account/quota behavior; native Codex config consumption; real provider cancellation; real Chat/Anthropic streams and tool loops; external sidecars; live fallback; token savings; and general quality preservation.
- `NOT_TESTED`: hosted Windows/macOS/Linux CI; OS service/shim installation and crash recovery; cross-platform runtime; real provider protocol smokes in this reconciliation.

## Delivery boundary

No public release action occurred. The archive is a local evidence artifact, not a published release.
