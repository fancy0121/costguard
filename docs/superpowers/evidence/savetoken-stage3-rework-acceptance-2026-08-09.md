# SaveToken Stage 3 Rework Acceptance Record

Date: 2026-08-09  
Scope: exact Stage 3 rework patch application plus local contract repair.  
Upstream reference: OpenCodex `2.11.0`, commit `57140d6f06218d604ee139e5909a1b868bf7a84b`.

## FACT

- The five supplied source patches were verified before application against the hashes in the handoff:
  - `src/types.ts` `A4B6FE9D85F6863D228CF9C03ADEB8B461889A2E1621205CEB3D4FF7F7E93B72`
  - `src/server/protocol.ts` `5E6455E17F7CE259FE756E6F16B767DEE63AE028E611E27EFEC369F798F46CBC`
  - `src/server/tools.ts` `889C5B33FFEAF8B5BB2053A467EC8956CDED3B5AC7C1D948523A77A5422F5C5B`
  - `src/index.ts` `F9309DF8D5FA6C8A0859EF0E1A41ED7C164DA68334A102CAF4152A3B01A51654`
  - `src/server/runtime.ts` was subsequently changed for the verified dispatch/evidence fixes; final hash is `9B5D9C1724581B19E3C5DF4FA20A1DFD90573B32CBB686EF1177F47D25944065`.
- A pre-application snapshot is retained at `work/stage3-rework-preapply-20260809/` with the five original hashes recorded in the handoff.
- Runtime changes now parse and validate the endpoint-specific request before adapter invocation, pass only `normalized.pureBody`, and attach route-admission evidence to protocol-validation errors when the provider tier is verified.
- Tests were updated to assert protocol-native Responses, Chat Completions, and Anthropic Messages shapes, required Anthropic `max_tokens`, SaveToken-field stripping, and validation fail-closed behavior.
- The outer SaveToken directory is not a Git repository (`git rev-parse` exit 128). The read-only upstream clone is clean on `main` at the baseline commit above.

## VERIFICATION

Commands were run from `savetoken-runtime` with the bundled Bun 1.3.14 executable:

- `bun test`: **104 pass, 0 fail, 259 assertions**.
- `bun x tsc --noEmit`: **exit 0**.
- `bun run lint`: **exit 0**, `lint clean`.
- `bun run privacy:scan`: **exit 0**, `privacy scan clean: 0 hits`.
- `bun run package:check`: **exit 0**, `allowed: 44`, `excluded: 692`, `missing: []`.

## INFERENCE

- The Stage 3 rework regression set is locally green for the credential-free protocol/runtime contracts covered by these tests.
- The dispatch boundary no longer forwards SaveToken routing metadata to an injected adapter in the tested Responses path; the parser contract covers Chat and Anthropic pure-body construction as well.
- This is not evidence of real OpenCodex/provider parity or of quota savings.

## UNKNOWN / NOT TESTED

- Real Provider/OAuth/API-key calls, live discovery, actual runtime model identity, quota/account health, and paid fallback.
- Invalid JSON, cancellation before a request body is available, or a missing provider-tier declaration cannot produce a complete typed route-admission record; those paths remain fail-closed without one.
- Real streaming, tool-call round trips, image/vision/search adapters, WebSocket bridge behavior, and provider-specific error fidelity.
- Native Codex catalog injection/restore, service/shim installation, GUI behavior, hosted cross-platform CI, crash recovery, and final release tarball privacy.
- No external ChatGPT Pro review or production deployment was performed in this local repair.

## RELEASE BOUNDARY

Stage 3 remains **not release-ready** under the frozen parity contract. The local rework gates are green, but the parity matrix still contains `PARTIAL`, `MISSING`, and `NOT_TESTED` rows. No commit, push, deployment, provider credential use, or upstream modification occurred.
