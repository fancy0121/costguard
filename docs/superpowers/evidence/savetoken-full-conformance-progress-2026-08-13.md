# SaveToken Full Conformance Progress — 2026-08-13 (current reconciliation)

## FACT

- The current source-tree run used Bun `1.3.14`: `bun test` exited `0` with 295 pass, 0 fail, 1014 expectations across 71 files. Typecheck, lint, privacy scan, and package check also exited `0`; package check reported 129 allowed, 657 excluded, and 0 missing.
- A new 129-file archive was built from the allowlist. Archive SHA-256: `3BD36D5C694AFF392BC094E6ED66694CEB376A168126C0F0CB1CD8ED48786971`. Manifest SHA-256: `E8B2BD76FB7772A1160335A0291FFE4753C6DB767F1A0DD4AFDA099307C76FF3`.
- A fresh temporary extraction verified every manifest path, size, and SHA-256, installed the frozen Bun 1.3.14 lockfile, and ran typecheck/test/lint/privacy/package with exit `0`: 295 pass, 0 fail, 1009 expectations across 71 files. The explicit package-scope CI-workflow skip accounts for the five-expectation difference; it is not hosted CI evidence.
- A reusable `scripts/verify-release-manifest.ts` entry re-verifies the rebuilt archive manifest against the staged package entry-for-entry (path, size, SHA-256, count, and total bytes); the current run reported 0 mismatches.
- Owned-state writes and batch journal recovery now reject any reparse point (symlink/junction) along a resolved target path before any `.owner` file is written. This closes a transaction-root and recovery-journal junction escape.
- Uninstall traversal now explicitly skips reparse-point entries and never follows a junction out of the managed home; a regression test confirms owned state behind a home junction is not removed.
- A new `tests/codex-catalog-subagent-conformance.test.ts` locks the catalog projection contract for subagent-only models, fail-closed unconfigured/duplicate/non-string subagent entries, and no-invented-route projection.
- Provider discovery now uses only a fixed loopback `GET /v1/models`, projects configured route IDs, persists only owned route-ID/timestamp cache metadata, returns 503 for cache/discovery `UNKNOWN`, and does not upgrade readiness.
- Catalog projection through actual isolated management install/sync accepts only explicit selected/subagent/injection/effort configuration, and fails closed before write for invalid effort or a non-execution combo.
- The Quality Gate validates protocol-native Responses, Chat, and Anthropic JSON/tool output against its existing bounded schema subset. Invalid explicit schemas are rejected before adapter dispatch; structured streaming is explicitly rejected because a full stream-time quality proof is unavailable.
- Completed fixture Responses streams may record only explicitly parsed `response.created` and `response.output_item.done(function_call)` IDs. A strict follow-up tool-output continuation is exercised. Cancelled or terminal-missing streams do not receive that state, and inspection is bounded at 256 KiB rather than retaining an unbounded stream transcript.
- Sidecar/WebSocket local façade rejects unknown capability identifiers and top-level SaveToken control fields before the adapter. Local web-search/vision fixture paths are not reported as external service calls.
- Management callback exceptions and malformed CLI startup configuration return stable redacted fail-closed results. Service/shim planning remains non-executed and rejects unknown platform/action at runtime.
- Proxy base URLs now require a pure loopback HTTP origin and bounded request timeout; path, credentials, query, and fragment input is rejected before a request. Anthropic streaming treats `message_delta.stop_reason` as intermediate and requires an explicit `message_stop` terminal.
- Upstream remains read only at `57140d6f06218d604ee139e5909a1b868bf7a84b` on `main`, with empty status output.

## INFERENCE

The local isolated contract is stronger across protocol conformance, configuration projection, discovery cache ownership, management error handling, and sidecar admission. This does not prove a live Provider, native Codex configuration consumption, external sidecar availability, or OpenCodex behavioral parity.

## UNKNOWN

Real Provider availability and identity, OAuth/account/quota semantics, native Codex configuration consumption, real Chat/Anthropic stream-tool-cancel behavior, external sidecars, live fallback, hosted CI, OS service/shim installation, token savings, and general quality preservation remain `UNKNOWN` or `NOT_TESTED`.
