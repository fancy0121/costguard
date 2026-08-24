# CostGuard

多模型分级路由层：Sol 决策、便宜模型执行，**绝不把高风险任务静默降级**。

> **状态：实验性 / 研究项目，非成品。** 本地 308 测试通过、clean-room 可复现、隐私扫描 0 命中、无密钥入库。但未达 OpenCodex 全量 parity、未做跨平台/托管 CI、原生 Codex 消费未验证。完整边界见文末「已验证 / 未验证」。

## 一句话定位

CostGuard 是建立在 OpenCodex 之上的「安全分级 + 质量闸门 + 证据治理」层。它不替代 OpenCodex 做模型代理，而是决定「这个任务该交给哪个模型，并且不能偷偷降级」。

## 冻结基准结论（2026-08-24，24 任务 / 12 类别）

- 「省 token」不成立：DeepSeek 用 11,832 token，是 Sol（3,081）的 **3.84 倍**。
- 「省钱」成立（估算）：DeepSeek ≈ $0.0026 vs Sol ≈ $0.034–0.050，便宜约 **13–19 倍**。按公开单价估算，非账单保证。
- 通过率：DeepSeek 20/24，Sol 17/24（单次运行，统计稳定性未验证）。

## 路由层级（冻结）

| 层级 | 模型 | 职责 |
| --- | --- | --- |
| 5 | GPT-5.6 Sol | 架构、安全、权限、生产、堵点、最终验收 |
| 4 | GPT-5.6 Terra | 中等复杂规划、跨文件分析、测试设计 |
| 2–3 | Luna / DeepSeek V4 | 平级执行层：编码、批量、提取、格式化 |
| 1 | 智谱 GLM | 仅两条执行路线都不可用时的低风险末级备用 |

## 安全

- 无 API Key / Cookie / Token / 私钥入库（隐私扫描 0 命中）。
- fail-closed：模型身份不匹配、代理不可达、结构化输出不合格 → 返回失败，不静默降级。
- 高风险任务无 Sol/Terra 时闭锁并标记 `UNKNOWN`。
- MIT 许可（基于 opencodex，保留上游归属）。

## Local entrypoint

From this directory:

```powershell
npx --yes bun@1.3.14 install
npx --yes bun@1.3.14 run typecheck
npx --yes bun@1.3.14 test
npx --yes bun@1.3.14 run lint
npx --yes bun@1.3.14 run privacy:scan
npx --yes bun@1.3.14 run package:check
```

To start a local route-preview server with an explicit, credential-free catalog:

```powershell
$env:SAVETOKEN_PROVIDERS_JSON='{"openai":["gpt-5.6-sol"]}'
$env:SAVETOKEN_PORT='8787'
npx --yes bun@1.3.14 src/index.ts
```

The server writes only to the effective `SAVETOKEN_HOME`. Set `CODEX_HOME` to
an isolated test directory when exercising configuration boundaries. The
route-preview response intentionally reports `actualRuntimeModel: "UNKNOWN"`.
Without a configured provider tier, `/v1/*` fails closed with HTTP 503
`UNKNOWN`; with a declared tier but no explicitly injected credential-free
adapter, it returns HTTP 503 `NOT_TESTED` rather than a successful-looking
2xx response. This package does not claim a real provider invocation.

An injected execution-tier adapter must receive server-side
`SaveTokenTaskSignals`; without those trusted structured signals, the data
plane fails closed with `task-tier-candidate-mismatch` and includes redacted
route-admission evidence rather than guessing that a standard request is safe
for execution.

When `SAVETOKEN_MANAGEMENT_TOKEN` is set by environment reference, the local
management plane exposes authenticated `GET /api/status`, `GET /api/health`,
`GET /api/ready`, `GET /api/catalog`, `GET /api/providers`, `GET /api/usage`,
`GET /api/logs`, and authenticated lifecycle operations. The token value is
never written to runtime state or evidence.

## Implemented boundaries

- Typed CostGuard route decisions with Sol/Terra/execution tiers and fail-closed high-risk paths.
- Explicit `provider/model` routing and default-provider fallback only when no explicit route is present.
- Effective home resolution, atomic owned JSON writes, and ownership-scoped restore.
- Isolated-only managed root `openai_base_url` configuration injection with
  content-hash journal state, exact restore, conflict/user-edit fail-closed
  behavior, and no stored user configuration content.
- Separate health and readiness states.
- Independent Responses, Chat Completions, and Anthropic request parsers and
  native response shapers with tool preservation; SaveToken control fields are
  removed before adapter dispatch.
- Terminal stream states and observable cancellation.
- Redacted route evidence and privacy scanning.
- Credential-free provider registry, auth-reference separation, local cooldown
  observations, and explicit low-risk failover only after verified unavailability.
- Catalog backup/restore with ownership markers, effort caps, subagent fallback, and combo route validation.
- CLI request boundary and subprocess lifecycle; local WebSocket bridge to an
  explicitly injected/authorized allowlisted sidecar facade; platform-specific
  non-executed service/shim plans; and package allowlist checks.

Real OAuth/API-key exchange, live Provider error behavior, account/key pool
operation, native Codex consumption of injected config, external sidecar calls,
cross-platform service installation, GUI rendering, real three-protocol
streaming/tools/cancellation, and quality/cost comparison remain `UNKNOWN` or
`NOT_TESTED`.

## 已验证 / 未验证

已验证（有本地证据）：308 测试 + typecheck/lint/privacy/package 全绿；clean-room 可复现；路由分级与 fail-closed；Quality Gate v0.1 结构化校验；配置 ownership 与恢复保护；DeepSeek 全链路真实请求；Sol vs DeepSeek 冻结基准对比。

未验证（UNKNOWN / NOT_TESTED）：Sol/Terra/Luna/GLM 的实时可用性与真实调用；原生 Codex 对注入配置的消费；Windows/macOS/Linux service/shim 与跨平台托管 CI；真实 Provider 的 401/403/429/5xx 与配额、取消上游传播；按账户实际账单的美元成本。

## 免责声明

本项目是独立社区实验，不替代 OpenCodex，不替代 ChatGPT Pro 权益，不承诺节省金额。模型单价与账户计费随时变动，「省钱」结论是基于公开单价的估算，不是账单保证。
