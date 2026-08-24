# SaveToken Quality/Token Benchmark Harness — Phase 1

> Superseded for future Provider runs by `savetoken-quality-token-benchmark-instrument-v2-report-2026-08-24.md` and frozen instrument `quality-token-v2-r1-r5`. This file remains historical evidence for the 12-task v1 harness.

Date: 2026-08-24  
Status: `PARTIAL`

## FACT

- The frozen benchmark source remains `savetoken-quality-token-benchmark-fixtures-2026-08-15.json`: 12 tasks and their acceptance objects are loaded at runtime. The runner does not carry a second acceptance table and does not send acceptance data to the Provider.
- `CODE-09`, `CODE-10`, and `TEST-11` now execute through the same runner as the other nine fixtures.
- `CODE-09` is evaluated against the fixture's four local cases. Provider code is limited to 10,000 characters, capability-bearing identifiers are rejected, TypeScript is transpiled locally, and execution occurs in a code-generation-disabled VM with a 100 ms timeout and no process/network object in its context.
- `BENCH_MODEL` is optional and defaults to `deepseek/deepseek-v4-flash`. A supplied value must be one safe `provider/model` route. No fallback is implemented.
- The runner always uses the fixed loopback `http://127.0.0.1:10100/v1/responses` endpoint, never sets `reasoning_effort`, verifies every returned model identity, records HTTP status, response/output SHA-256, and normalizes input/output/reasoning/total usage. Multi-turn usage is the sum of both returned usage records only when each field is numeric; otherwise it is `UNKNOWN`.
- An identity mismatch makes the affected result `UNKNOWN`; it cannot become a quality pass.
- Reproducible default command after a required Codex restart: `bun scripts/run-deepseek-benchmark-side.ts`. Sol later uses the identical command with `BENCH_MODEL=openai/gpt-5.6-sol` supplied by the caller; this was not executed in Phase 1.
- Current read-only OpenCodex preflight: `/healthz` 200 (`opencodex` 2.11.0, `ok`); `/readyz` 200 (`ready`); `/v1/models` 200 with 29 entries; DeepSeek and Sol catalog entries are visible. Catalog visibility is not invocation proof.
- Real DeepSeek benchmark requests were not sent. The active Codex model catalog changed after startup, and the current runtime explicitly prohibits new model or reasoning-effort overrides until Codex restarts. Running the default command would set the prohibited DeepSeek model field; using an unspecified model would not prove DeepSeek.
- No dependency or lockfile changed. No commit, push, publish, deploy, production configuration change, or upstream modification occurred.

## Actual validation

| Command | Exit | Result |
| --- | ---: | --- |
| `bun test tests/quality-token-benchmark-runner.test.ts` before implementation | 1 | RED: missing `src/benchmark/quality-token` |
| `bun test tests/quality-token-benchmark-runner.test.ts` final | 0 | 5 passed, 0 failed, 57 assertions |
| `bun run typecheck` | 0 | TypeScript clean |
| `bun test` | 0 | 307 passed, 0 failed, 1134 assertions, 72 files |
| `bun run lint` | 0 | clean |
| `bun run privacy:scan` | 0 | 0 hits |
| `bun run package:check` | 0 | 134 allowed, 657 excluded, 0 missing |

## Modified files and SHA-256

| SHA-256 | File |
| --- | --- |
| `0053CF27325F10213543CEF36ED0E6869A195941EEE1EBCD179317CAB2D951EF` | `savetoken-runtime/src/benchmark/quality-token.ts` |
| `299A4FA6A4B917D6AA60766438E2E5EAB9C432D73C2A6120F4CE16E6AFC0C5A6` | `savetoken-runtime/scripts/run-deepseek-benchmark-side.ts` |
| `6B4B52A850FB7C4BFBE341F3BEFEEC6C38EE855F9FD825642FD2F1DCB1783859` | `savetoken-runtime/tests/quality-token-benchmark-runner.test.ts` |

Reference fixture SHA-256: `50139AE5AD7829416E3D5874AFB1807E03AEB85D70DB0D47839771A96C50DA3D`.

## INFERENCE

- The harness is locally Sol-ready: the same fixture inputs, evaluator, request path, usage normalization, identity checks, and output schema are used for any explicitly selected model.
- Local fake-fetch coverage and passing gates prove runner behavior, not DeepSeek or Sol quality, availability, token usage, or savings.

## UNKNOWN

- The current DeepSeek 12-task result and usage evidence.
- Sol reachability and Sol 12-task baseline.
- Sol/Terra/Luna/GLM identity smokes.
- Any claim that the execution tier saves tokens while preserving Sol quality.

## Stop condition

Restart Codex before setting `BENCH_MODEL` or invoking the default DeepSeek route. After restart, Phase 1 may execute exactly one DeepSeek benchmark run. Phase 2 still requires the user's per-request authorization for Sol and the four route identity smokes.
