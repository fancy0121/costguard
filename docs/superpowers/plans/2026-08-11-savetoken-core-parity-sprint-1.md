# SaveToken Core Parity Sprint 1 Plan

Date: 2026-08-11
Upstream: OpenCodex 2.11.0, commit 57140d6f06218d604ee139e5909a1b868bf7a84b
Baseline: 128 tests passing, D-5 proxy route completion (Sol/Terra/DeepSeek PRESENT)

## Work Package A: Luna SSE Diagnosis + GLM Safety Routing

### A1: Luna SSE root cause
- Direct OpenCodex call for Luna with same prompt as Sol/Terra
- SaveToken full-chain call for Luna
- Compare raw SSE events byte-for-byte
- If OpenCodex also returns only [DONE], Luna is provider-specific (PARTIAL by design)
- If SaveToken drops events, fix the parsing

### A2: GLM safety backup routing
- Fix invokeWithFailover to allow GLM as sole candidate when it's the only low-risk route
- Add explicit availability state check
- Real GLM smoke test through SaveToken
- Regression tests for GLM safety rules

## Work Package D: Codex Integration Control Plane

### D1: Transactional config lifecycle (already implemented, verify)
- SAVETOKEN_HOME / CODEX_HOME isolation
- Atomic writes with ownership markers
- Journal recovery
- Restore/uninstall preserving user edits

### D2: CLI and status (already implemented, verify gaps)
- CLI lifecycle commands
- Doctor/status/health/ready outputs
- verify in isolated temp directory

## Work Package E: Conformance and Evidence

### E1: Update parity matrix
- Map upstream capabilities to SaveToken status
- Mark PRESENT only with executable evidence
- Document all PARTIAL/UNKNOWN/NOT_TESTED

### E2: Documentation sync
- Update README with verified routes
- Update capability manifest

## Non-goals
- No SSE passthrough (Work Package B) — requires streaming infrastructure
- No multi-turn tools (Work Package C) — requires real Provider round-trips
- No service/shim installation (NOT_TESTED)
- No cross-platform CI execution (NOT_TESTED)