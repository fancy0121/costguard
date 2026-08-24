# SaveToken DeepSeek 执行层深验证 — 2026-08-15

## Overall status: 8 PRESENT / 1 FAILED（严格 JSON schema 预期内失败）

本报告记录在「仅 DeepSeek 可用」窗口下，对执行层 DeepSeek 的真实路由验证。所有请求均通过本机 OpenCodex 代理（`http://127.0.0.1:10100`）发出，T9 额外走 SaveToken runtime 全链路。

## FACT

### 结果矩阵

| id | 项目 | HTTP | 结论 | 关键事实 |
| --- | --- | --- | --- | --- |
| T1 | 单轮身份 | 200 | PRESENT | model=deepseek-v4-flash，输出 DEEPSEEK_OK，113 tokens |
| T2 | 流式 SSE 终态 | 200 | PRESENT | 40 帧，response.completed + [DONE]，model 身份确认，121 tokens |
| T3 | 单工具调用 | 200 | PRESENT | function_call 名称 get_weather、参数含 city |
| T4 | 多轮工具 | 200 | PRESENT | 首轮 call_id 捕获，次轮正确使用工具结果给出最终答案；缓存命中 384 tokens |
| T5 | 严格 JSON 对象 | 200 | PRESENT | `{"name":"example","count":42,"active":true}`，类型正确 |
| T6 | 严格 JSON schema | 200 | FAILED | 两次运行均不遵从 `additionalProperties:false`：一次多 7 字段、一次输出 markdown 代码围栏 |
| T7 | 客户端取消 | 200 | PRESENT | 3 帧后中止，无假终态；上游是否真正取消未验证 |
| T8 | 无效模型错误映射 | 400 | PRESENT | 返回 400，未泄漏 key/token/secret |
| T9 | SaveToken 全链路 | 200 | PRESENT | model=deepseek/deepseek-v4-flash，输出正确，122 tokens；路由准入在响应头 |

### 关键协议事实

- 路由准入证据（`RouteAdmissionEvidence`）以 **`x-savetoken-route-admission` 响应头** 返回，不在响应 body。T9 实测：`decidingTier=execution`、`requestedTier=execution`、`selectedProviderTier=execution`、`escalationReasons=[]`、`signalSource=structured`。
- 模型身份字符串在 raw 代理层是 `deepseek-v4-flash`（裸名），在 SaveToken runtime 层是 `deepseek/deepseek-v4-flash`（带 provider 前缀）。两者均确认 DeepSeek 身份，属归一化差异，非错误。
- 无效模型返回 400，错误 body 透传 provider 的「支持模型名列表」信息，但不含密钥/令牌等敏感项。

## INFERENCE

- DeepSeek 作为执行层的核心真实能力（单轮、流式、单/多轮工具、取消、错误映射、全链路路由）已验证可用。
- 严格结构化输出（`json_schema` + `additionalProperties:false`）对 DeepSeek 不可靠，且失败模式不固定（额外字段 / 代码围栏）。这与早前决策校准「分类和转换对 DeepSeek 格式遵从不可靠」的结论一致，并进一步定位到严格 schema 场景。
- 因此 DeepSeek 适合高格式容忍的提取/分类/格式化/摘要/翻译，不适合需要严格 schema 的结构化提取；后者应路由更高层模型或由 Quality Gate 422 闭锁。

## UNKNOWN / 未验证

- 取消是否传播到上游 DeepSeek 服务（本机只能观察客户端无假终态，看不到上游计费与连接）。
- 真实 429 / 503 / 认证失败（未触发真实限流或认证错误，只验证了 400 无效模型路径）。
- 并行工具调用、超长上下文、DeepSeek `deepseek-v4-pro` 路线。

## 交付物

| 文件 | SHA-256 |
| --- | --- |
| `docs/superpowers/evidence/savetoken-deepseek-deep-verification-2026-08-15.json` | `F04BF5640B7FA1583D919682019FD9214E74B5A7DF73086504640A20897A0E00` |
| `savetoken-runtime/scripts/run-deepseek-deep-verification.ts` | `8C1BBF1505D630E0E955B7CB69880411CF8985209EF39D71DB32B94C0FBC9219` |
| `docs/superpowers/plans/savetoken-quality-token-benchmark-2026-08-15.md` | `380F1E9D55C2B0A19A6A1E07C35C28BE4A2586403E96ACC9F6D21C3490B7A495` |

未提交、未推送、未发布、未部署。
