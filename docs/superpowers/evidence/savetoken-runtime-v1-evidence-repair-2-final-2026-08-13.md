# Runtime v1 Evidence Repair 2 — Final Report

## 2026-08-24 re-validation result: PARTIAL

This is the current acceptance section. It supersedes the 2026-08-20 totals while retaining the same fail-closed overall result.

### FACT

- Authoritative workspace: `C:\Users\ASUS\Documents\Codex\2026-08-08\codex-sol-luna-max-token-10`.
- No production runtime source was changed in this refresh. Two protocol E2E tests were extended to prove same-runtime two-request tool sessions.
- Bun 1.3.14 source gates: typecheck exit 0; 302 tests passed, 0 failed, 1077 assertions across 71 files; lint exit 0; privacy scan exit 0 with 0 hits; package check exit 0 with 132 allowed, 657 excluded and 0 missing.
- Fresh clean-room: `C:\Users\ASUS\AppData\Local\Temp\savetoken-repair2-final-016b98c6eb3341ea8fde2ecdd6c926f3`; copy exit 1 (Robocopy success-with-copied-files), frozen install exit 0, typecheck exit 0, 302 tests passed, 0 failed, 1072 assertions across 71 files, lint/privacy/package exits 0.
- The source/clean-room assertion difference is expected and bounded: the package excludes the project-root `.github` workflow, so the clean-room CI-contract test explicitly records the root-level check as skipped. Hosted Windows/macOS/Linux CI itself was not run and remains `NOT_TESTED`.
- OpenCodex read-only preflight: `/healthz` 200 (`opencodex` 2.11.0, `ok`); `/readyz` 200 (`ready`); `/v1/models` 200 with 29 entries and `deepseek-v4-flash` visible.
- A real DeepSeek request was not sent. After the catalog changed, the running Codex prohibited new model/reasoning-effort overrides until restart; using an unspecified/default model would not prove the required route.
- Read-only upstream: branch `main`, commit `57140d6f06218d604ee139e5909a1b868bf7a84b`, version 2.11.0, `git status --short` empty.
- No dependency or lockfile change. No credential value, default `CODEX_HOME`, production data or external user data was read or written. No commit, push, publish, deploy or upstream modification occurred.

### Work-package acceptance

| Package | Current executed evidence | Real smoke | Status | Remaining exact gap |
| --- | --- | --- | --- | --- |
| WP1 multi-turn tools | Responses strict conversation tests plus new Chat and Anthropic same-runtime initial → tool call → result → continuation → final-response tests; focused Chat/Anthropic suite 10/10 | `UNKNOWN` | `PARTIAL` | Required current DeepSeek multi-turn smoke could not be sent under the post-catalog-change model override prohibition |
| WP2 isolated config/catalog | Isolated real management lifecycle, ownership, journal recovery, CRLF and user-edit preservation reran in source and clean-room | N/A | `PARTIAL` | Config/catalog are not proven as one crash-atomic multi-file transaction; actual native Codex consumption is `UNKNOWN` |
| WP3 CLI/management/runtime | Actual CLI subprocess lifecycle, stale PID, exact unauthorized response, same-port conflict and stop teardown reran | N/A | `PRESENT` (local runtime scope) | OS service/shim is separately `NOT_TESTED` |
| WP4 availability/cooldown/fallback | Fake-clock cooldown and strict local error/fallback matrix reran | `UNKNOWN` | `PARTIAL` | No real 401/403/429/5xx/cooldown evidence |
| WP5 SSE | Three-protocol fixture E2E for content type, terminal, missing terminal, error and cancellation reran | `UNKNOWN` | `PARTIAL` | No current real DeepSeek stream; proxy stream identity remains externally unverified |
| WP6 sidecar facade | Local facade/runtime WebSocket success, auth, allowlist, invalid-message, close and cancel paths reran | `UNKNOWN` | `PARTIAL` | No real external sidecar service was called |

### Actual modifications in this refresh

- `savetoken-runtime/tests/chat-completions-conformance-e2e.test.ts` — add a same-runtime two-request native Chat tool loop; SHA-256 `C2ECA9D3F9B3BCE85EB8BD3F64D22BE45AF2721FE8E0B9DEED130918BDF434D9`.
- `savetoken-runtime/tests/anthropic-messages-conformance-e2e.test.ts` — add a same-runtime two-request native Anthropic tool loop; SHA-256 `4F25F901AC68415B11A48BB0690D655424253BC557CE650B619FA0424D0DEB72`.
- This final report and `savetoken-runtime-v1-audit-corrections-2026-08-13.md` were updated with current evidence.

### INFERENCE

- The local Chat/Anthropic session-evidence gap is closed. The tests passed without production-code changes, so this refresh adds evidence rather than claiming a new runtime implementation.
- Local and clean-room success does not establish OpenCodex parity, external Provider behavior, quality preservation or Token savings.

### UNKNOWN

- Current real DeepSeek multi-turn and SSE; upstream cancellation propagation; real quota/cooldown/auth failures; native Codex config/catalog consumption; external sidecars; Windows/macOS/Linux services; hosted CI; quality or Token savings.

Final status: `PARTIAL`. The six packages are not all verified.

## Superseded 2026-08-20 re-acceptance result: PARTIAL

This section supersedes every older “six work packages PRESENT” statement in this file. The older material below is retained only as historical evidence and must not be used as current acceptance.

### FACT

- Authoritative workspace: `C:\Users\ASUS\Documents\Codex\2026-08-08\codex-sol-luna-max-token-10`.
- Root Git repository has no readable HEAD and all current project files are untracked; no commit or branch baseline is claimed. The pre-change status stream contained 1312 lines and had SHA-256 `38B584409085D9072E25F1497F23D6862E362BD1DAAA3E396B194CEEC7CAAF20`.
- Read-only upstream: version baseline 2.11.0, commit `57140d6f06218d604ee139e5909a1b868bf7a84b`; upstream status was empty.
- Bun: 1.3.14.
- Source verification: typecheck 0; 300 tests passed, 0 failed, 1061 assertions, 71 files; lint 0; privacy scan 0 hits; package check 132 allowed, 657 excluded, 0 missing.
- Clean-room directory: a new system-temporary directory, copied without `.git` or `node_modules`; copy exit 1 (Robocopy success-with-copied-files), frozen install 0, typecheck 0, 300 tests passed, 0 failed, 1056 assertions, 71 files, lint 0, privacy 0, package 0.
- OpenCodex preflight: `/healthz` 200 and `/readyz` 200. `/v1/models` timed out after 3 seconds, so no real Provider request was sent.
- No dependencies or lockfile were changed.
- No credential value, default `CODEX_HOME`, production data or external user data was read or written. No commit, push, publish, deploy or upstream modification occurred.

### Work-package acceptance

| Package | Runtime entry | Executed evidence | Real smoke | Status | Remaining exact gap |
| --- | --- | --- | --- | --- | --- |
| WP1 multi-turn tools | `ConversationStore.recordIssuedCall`, `validateToolResultInput`, protocol continuation validators, runtime `/v1/*` | 28/28 focused tests; exact missing/unknown/duplicate/name-mismatch rejection; post-invoke cancellation discarded | `UNKNOWN` | `PARTIAL` | Chat/Anthropic are complete-transcript continuation tests, not same-runtime two-request sessions; `/v1/models` timeout prevented DeepSeek smoke |
| WP2 isolated config/catalog | runtime management lifecycle, managed config journal, catalog projection, ownership helpers | 29/29 focused tests through isolated homes | N/A | `PARTIAL` | Config and catalog steps are ordered but not one crash-atomic transaction; actual native Codex consumption not run |
| WP3 CLI/management/runtime process | CLI main/commands/process, management handler, runtime doctor | 6/6 subprocess tests plus process recovery tests; all lifecycle commands, stale PID, exact 401, same-port conflict and stop teardown | N/A | `PRESENT` (local scope) | OS service/shim is separately `NOT_TESTED` |
| WP4 availability/cooldown/fallback | ProviderRegistry, availability selector, runtime observations and route admission | 16/16 focused tests with fake clock and full error/fallback matrix | `UNKNOWN` | `PARTIAL` | No current real 401/403/429/5xx/cooldown evidence |
| WP5 SSE conformance | registry stream boundary, runtime stream path, terminal guard | 19/19 three-protocol fixture E2E including terminal, missing terminal, error and cancel | `UNKNOWN` | `PARTIAL` | proxy-auth streaming remains fail-closed until terminal model identity can be safely verified |
| WP6 sidecar facade | SidecarFacade and runtime WebSocket bridge | 10/10 runtime/facade E2E for success, allowlist, auth, invalid message, close and cancellation | `UNKNOWN` | `PARTIAL` | no external sidecar service was called |

### Actual modifications in this repair

- `savetoken-runtime/src/server/conversation.ts`: retain optional issued tool name and reject explicit mismatches.
- `savetoken-runtime/src/providers/registry.ts`: discard Provider results when cancellation occurs during invocation.
- `savetoken-runtime/src/cli/process.ts`: inspect owned process state and reject an already-bound runtime port.
- `savetoken-runtime/src/server/runtime.ts`: expose stale/unverified process state through doctor; pass tool names into conversation state.
- `savetoken-runtime/tests/multi-turn-strict.test.ts`: remove missing-ID false pass and add name-mismatch proof.
- `savetoken-runtime/tests/provider-registry-stage3.test.ts`: prove cancellation during invocation cannot become PRESENT.
- `savetoken-runtime/tests/cli-subprocess-e2e.test.ts`: actual lifecycle, stale doctor, exact unauthorized response, port conflict and stop teardown.
- This audit-corrections file and this final report.

### Recomputable SHA-256 for modified runtime files

| SHA-256 | File |
| --- | --- |
| `B1BC84234C71C58002AAE96016FA956B68E55D9A9E7E5BD6C6BE7BFEEEE3717F` | `savetoken-runtime/src/server/conversation.ts` |
| `488C2B2E9E84BFC012554C8991258C82E3FDF0C1CCFC519E6F297D5C91E21E3A` | `savetoken-runtime/src/providers/registry.ts` |
| `89E6FBDC039CF04197ADCA5B769E85BBDB7020C61DCF87419D54A69D4C554CCD` | `savetoken-runtime/src/cli/process.ts` |
| `4F474CBBC73E53C3BD138B2024E43D2C0851FF65C82ABBB336EA2B5AF2988DEB` | `savetoken-runtime/src/server/runtime.ts` |
| `DFF1BF1689603D811174273D4B30C115D275953FF7ADFBB0C6C420E4ADC899AB` | `savetoken-runtime/tests/multi-turn-strict.test.ts` |
| `5FBE3C7E64A0B833A4A71809E2CCBB0AF2047AB3FF30ABA1FF7820B628D1A453` | `savetoken-runtime/tests/provider-registry-stage3.test.ts` |
| `87451678EADE9ED8343D594EE5B7B3450B6FD510268C40DFAA7DC9CB14F73911` | `savetoken-runtime/tests/cli-subprocess-e2e.test.ts` |

### INFERENCE

- The repaired local behavior is more defensible than the withdrawn historical report because the new tests hit the promised public/runtime entrypoints and reproduced three concrete bugs before implementation.
- Local evidence does not establish OpenCodex parity or external Provider behavior.

### UNKNOWN

- Real DeepSeek multi-turn and SSE in this run; upstream cancellation propagation; real quota/cooldown and auth errors; external sidecars; native Codex config/catalog consumption; Windows/macOS/Linux services; hosted CI; quality or Token savings.

Final status: `PARTIAL`. The six packages are not all verified.

> Superseded evidence notice: this report's “six work packages PRESENT” conclusion is withdrawn. Some tests were later found not to establish the promised external or strict-entrypoint behavior. The current row-by-row assessment is [savetoken-upstream-conformance-matrix-2026-08-13.json](savetoken-upstream-conformance-matrix-2026-08-13.json) and [savetoken-full-conformance-final-2026-08-13.md](savetoken-full-conformance-final-2026-08-13.md); overall status is `PARTIAL`.

Date: 2026-08-13

## FACT

### Test totals
- 168 tests, 0 fail, 46 files (was 144/41)
- typecheck: 0, lint: clean, privacy: 0 hits, package: 48 allowed 0 missing

### WP1 Multi-turn tool calls — PRESENT
- Strict tests: missing/unknown call_id → 422; duplicate result → 422; valid cycle completes
- Code: src/server/conversation.ts (new ConversationStore per runtime), runtime.ts validation
- Real DeepSeek multi-turn smoke: Step1 FC=get_weather city=Tokyo; Step2 final text; PASS

### WP2 Config lifecycle — PRESENT
- Real entry points via management API: install/status/sync/restore/uninstall/doctor
- User config.toml preserved; user files survive restore/uninstall; journal residue detected by doctor

### WP3 CLI/management — PRESENT
- stop → /readyz not ready; fixed port conflict second instance fails; 401 without leaks
- CLI install/sync/doctor/restore/uninstall via API

### WP4 Provider availability — PRESENT
- Fake clock cooldown recovery; unknown quota excludes; 5xx/network/mismatch UNKNOWN
- Luna→DeepSeek only when Luna explicitly unavailable; high-risk Sol unavailable → 503 + routeAdmission

### WP5 SSE conformance — PRESENT
- stream without streamInvoke → 422 fail-closed (no fake streaming)
- Real DeepSeek SSE: 200, text/event-stream, 93 events, [DONE], completed, model confirmed

### WP6 Sidecar facade — PRESENT
- Success paths: configured capability PRESENT; not-requested MISSING; whitelist boundary UNKNOWN
- WebSocket: authorized PRESENT, close MISSING, unauthorized UNKNOWN

## Modified files
  CADAB97A46DE67BA20FEBAD81CCA6A9C67B8927E522FE0B05420376F1D50BAC2  conversation.ts
  E7288130AF57BC2B42D986C08C5456C1AFB5D8CAF431E4CB4413DF0F9BE3EBDD  runtime.ts
  C232AF504D6B2AC06C8D63293BDA660EFFCE85AC6A097EE8F245C61D25CA8703  management.ts
  1DDE1176178C1519AD8ADFB9DCD0A986493FF0C60DC3CCA2A1D55453448E63DC  commands.ts
  4FFB6CFB10F35455BCFE10C453C42EA6B24D5E25746C96DE4C046652BC15FDFE  opencodex-proxy.ts
  75D53B981F3E5D975E03E1A4A73981860C6A37EDA06509585ABAFFA1C66018D7  registry.ts
  716E8706064E298A500B1D90C19518559C59C1AC855627D3CBFFE11325853715  route.ts

## UNKNOWN
- Sol/Terra/Luna/GLM real SSE smoke: NOT RUN this round (DeepSeek only)
- 401/403/429 real provider errors: fixture-only
- Hosted CI, service install: NOT_TESTED

Not committed, pushed, published, or deployed.
