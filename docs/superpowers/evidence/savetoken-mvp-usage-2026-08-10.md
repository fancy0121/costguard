# SaveToken v0.1 MVP — Usage

> Historical usage notice: this document includes earlier bounded DeepSeek wiring context. It is not a current real-Provider validation and must not be used to claim current route availability. For the current local-only boundary, read [savetoken-full-conformance-final-2026-08-13.md](savetoken-full-conformance-final-2026-08-13.md).

## Verified route

```
SaveToken runtime  →  OpenCodex proxy adapter  →  local OpenCodex 2.11.0  →  DeepSeek V4 Flash
```

Only `deepseek-v4-flash` via `ProviderAuthMode = "proxy"` is verified. Sol, Terra, Luna, and GLM routes are not wired.

## Installation

```powershell
# Extract
Expand-Archive savetoken-v0.1.0-mvp.zip
cd savetoken-v0.1.0-mvp

# Install dependencies (Bun 1.3.14 required)
bun install --frozen-lockfile

# Verify
bun run typecheck
bun test
bun run lint
bun run privacy:scan
bun run package:check
```

## Configuration

Requires a running OpenCodex 2.11.0 instance with DeepSeek API key configured.

```typescript
import { startRuntime, createOpenCodexProxyAdapter } from "savetoken-runtime";

const adapter = createOpenCodexProxyAdapter({ baseUrl: "http://127.0.0.1:10100" });
const runtime = await startRuntime({
  env: { CODEX_HOME: "...", SAVETOKEN_HOME: "..." },
  providers: { deepseek: ["deepseek-v4-flash"] },
  providerAdapters: [adapter],
  providerTier: "execution",
});
```

## Quality Gate

- Explicit structured contracts (JSON schema, tool schema) → validated against provider output
- No contract → `qualityEvidence: UNSPECIFIED` (output passed through)
- Validation failure → HTTP 422, `failClosed: true`

## Limitations

- Only DeepSeek V4 Flash Responses route verified
- No Sol/Terra/Luna/GLM adapters
- No OAuth, no live model discovery
- No service/shim installation
- No cross-platform verification
- No OpenCodex parity claimed

## Restore/Uninstall

```typescript
// Restore: removes only Savetoken-owned config lines
await runtime.restore();

// Uninstall: removes only Savetoken-owned files
await runtime.uninstall();
```

User-created files and edits are preserved.
