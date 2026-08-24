# SaveToken Full Delivery Program Plan

Date: 2026-08-11
Baseline: Sprint 1 complete (5/5 routes PRESENT, 128 tests)

## Work Packages

### A. Data Plane & Protocol Parity
- SSE passthrough to client
- Multi-turn tool calls
- All three protocols (Responses/Chat/Anthropic) with native shapes
### B. Provider & Route Availability
- Runtime availability state (available/unavailable/unknown)
- GLM safety rules with availability checks
- Peer execution fallback (DeepSeek↔Luna)
### C. Codex Integration & Catalog
- Transactional config lifecycle
- restore/uninstall with user edit protection
### D. CLI & Management Plane
- CLI lifecycle commands (status/doctor/restore)
- Management API completeness
### E. Sidecar Facade
- Web search, vision, WebSocket interfaces
- Fail-closed without real adapters
### F. Quality & Evidence
- Benchmark task set
- Parity matrix update
- Documentation sync

## Non-goals
- Real service/shim installation
- Hosted CI execution
- New Provider or auth mode
- Global effort change