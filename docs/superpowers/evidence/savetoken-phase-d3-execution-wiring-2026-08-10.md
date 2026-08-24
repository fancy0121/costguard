# SaveToken Phase D-3: Execution Route Wiring

Date: 2026-08-10
Candidate: `deepseek/deepseek-v4-flash` via SaveToken → OpenCodex proxy → DeepSeek
Scope: Wire the single execution route end-to-end through SaveToken runtime

## FACT

### Design: `ProviderAuthMode = "proxy"`

Added `"proxy"` to `ProviderAuthMode` and `CredentialMode`. Defined as: adapter does not hold credentials; trusted local OpenCodex proxy handles upstream authentication.

### New file: `src/providers/opencodex-proxy.ts`

`createOpenCodexProxyAdapter(options)` — returns a `ProviderAdapter` that:
- Accepts only loopback URLs (`127.0.0.1`, `localhost`, `[::1]`)
- Forwards `pureBody` to OpenCodex at `POST {baseUrl}/v1/responses`
- Rejects bodies containing `savetokenTask`/`savetokenTier`/`savetokenRoute`
- Forwards `AbortSignal` for cancellation
- Validates response model identity = `deepseek-v4-flash`
- Fails closed on: invalid body, unreachable proxy, non-200 response, model mismatch
- Returns `actualRuntimeModel: "deepseek/deepseek-v4-flash"` (full `provider/model` format)
- No credentials stored or output

### Modified files

| File | SHA-256 | Change |
|------|---------|--------|
| `src/providers/registry.ts` | `A3B0A9C3...` | Added `"proxy"` to `ProviderAuthMode` |
| `src/providers/auth.ts` | `8D5F656C...` | Added `"proxy"` to `CredentialMode`, handled in `credentialReference` |
| `src/providers/opencodex-proxy.ts` | `517202FD...` | New: OpenCodex loopback proxy adapter |
| `src/server/runtime.ts` | `C15FFC41...` | Response shaping: extract `output` and `usage` from adapter response |
| `src/index.ts` | `87FDC86A...` | Export `createOpenCodexProxyAdapter` |
| `tests/opencodex-proxy-stage3.test.ts` | `E552F7A1...` | 9 focused tests: descriptor, loopback, pureBody, cancel, fail-closed |

### Quality gates

| Gate | Result |
|------|--------|
| typecheck | exit 0 |
| test | **113 pass, 0 fail** (36 files) |
| lint | clean |
| privacy:scan | clean (0 hits) |
| package:check | 47 allowed, 693 excluded, 0 missing |

### Real smoke test (1 request)

```
SaveToken Runtime → OpenCodex Proxy Adapter → 127.0.0.1:10100 → DeepSeek API
```

| Metric | Value |
|--------|-------|
| HTTP status | 200 |
| Model (response) | `deepseek/deepseek-v4-flash` |
| Object | `response` |
| Status | `completed` |
| Output text | `pong` |
| Output items | 2 (reasoning + message) |
| Usage | `{"input_tokens":87,"output_tokens":35,"total_tokens":122,"reasoning_tokens":32}` |
| savetoken fields leaked | NO |
| Response SHA-256 | `d22b18c2c2024ce249f99c386a558320273c323de22291c2d47dd063bd11e2f2` |

## INFERENCE

1. **Full chain verified**: SaveToken runtime → OpenCodex proxy adapter → running OpenCodex → DeepSeek API. All layers function correctly.
2. **Model identity confirmed**: Response `model: "deepseek/deepseek-v4-flash"` matches request, confirmed by adapter validation.
3. **`pureBody` enforcement works**: adapter rejects bodies still containing `savetoken*` fields.
4. **Usage is measurable**: Real token counts (87 in, 35 out, 122 total) from live provider.
5. **Routing evidence**: `routeAdmission` generated on every request; attached to error responses.
6. **Loopback safety**: adapter rejects non-loopback URLs at construction time, preventing SSRF.
7. **Only execution tier**: DeepSeek is wired as execution tier only. Sol/Terra/GLM not touched.

## UNKNOWN

- Whether `actualRuntimeModel` check in registry would pass for future models (only `deepseek/deepseek-v4-flash` tested)
- Multi-turn conversation through this adapter
- Streaming through SaveToken runtime (adapter returns full response, not SSE)
- Tool calls through SaveToken runtime (adapter passes response through; tool schema forwarding not tested)
- Concurrent requests, rate limiting, quota exhaustion
- GLM fallback (not wired, not tested, by design)

## Verdict

SaveToken execution route for `deepseek/deepseek-v4-flash` is **fully wired and verified**. The chain SaveToken → OpenCodex → DeepSeek functions correctly with confirmed model identity, measurable usage, and credential safety. Sol, Terra, and GLM routes remain unwired (by design).

**Stage: D-3 complete. WAIT_FOR_ACCEPTANCE.**