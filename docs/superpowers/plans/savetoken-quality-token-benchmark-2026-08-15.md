# savetoken 质量 + Token 基准集（冻结设计）

状态：冻结设计 v0.1（待 Sol 基线恢复后执行）
日期：2026-08-15

## 目的

为 SAVETOKEN_SPEC 第 6 节「质量不降低」提供可复现证据。核心命题：执行层（DeepSeek / Luna）在其允许的任务类型上，验收通过率不低於 Sol 基线，且（在确实节省的场景下）token 更低。

本文件是协议，不是结论。任何「省 token / 质量不降」的对外主张，必须由本基准的实际运行结果支撑。

## 对比协议

对每个任务执行两遍，输入与验收标准完全一致：

1. 基线：`gpt-5.6-sol`，default effort。
2. 执行层：按任务指定 `deepseek/deepseek-v4-flash` 或 `openai/gpt-5.6-luna`。

记录每遍：实际模型身份、`total_tokens`（含 reasoning 拆分）、HTTP 状态、是否命中验收、路由准入证据（`x-savetoken-route-admission` 头）、输出哈希。

判定：

- 质量：执行层通过率 < Sol 通过率的任务类型，标记「必须升级或 fail-closed」，不得继续路由到该执行层。
- Token：只有 `执行层 total_tokens / Sol total_tokens < 1` 时，该任务类型才允许宣称节省；否则如实记录「不节省」。

## 设计约束（来自 2026-08-15 DeepSeek 真实验证）

1. DeepSeek 的 `json_schema` 严格模式（`additionalProperties: false`）连续两次失败：一次额外多出 7 个字段，一次输出 markdown 代码围栏。二者都不满足严格结构化契约。
2. `json_object`（宽松、固定键）可以产出合法 JSON。
3. 因此：`SCH-05` / `SCH-06` 被设计为「预期失败」数据点。它们的价值是证明「严格结构化提取不能信任 DeepSeek」，应路由到更高层模型，或由 Quality Gate 以 422 闭锁。

## 任务集（12 个）

| id | 类别 | 预期层 | 预期模型 | 验收（机器可判） |
| --- | --- | --- | --- | --- |
| EXT-01 | 命名实体提取 | execution | deepseek-v4-flash | 输出实体集合与标准答案完全一致 |
| CLS-02 | 新闻分类 | execution | deepseek-v4-flash | 8 条标题的标签逐一精确匹配 |
| FMT-03 | 表格转 JSON | execution | deepseek-v4-flash | JSON 数组结构逐字段相等 |
| SUM-04 | 有界摘要 | execution | deepseek-v4-flash | 含全部关键实体且字数 ≤ 上限 |
| SCH-05 | 严格 JSON 对象 | execution | deepseek-v4-flash | 解析成功且键与类型完全等于标准（预期可能失败） |
| SCH-06 | 严格 JSON schema | execution | deepseek-v4-flash | 无额外键（`additionalProperties:false`，预期失败） |
| TOOL-07 | 单工具调用 | execution | deepseek-v4-flash | `function_call` 名称与参数精确匹配 |
| TOOL-08 | 多轮工具 | execution | deepseek-v4-flash | 最终答案使用工具结果且含预期事实 |
| CODE-09 | 简单函数实现 | execution | gpt-5.6-luna | 本地对隐藏用例运行全部通过 |
| CODE-10 | 定位缺陷 | terra | gpt-5.6-terra | 指出精确缺陷行与根因 |
| TEST-11 | 测试设计 | execution | gpt-5.6-luna | 覆盖全部必需用例 |
| TRA-12 | 短翻译 | execution | deepseek-v4-flash | 关键术语存在且无残留英文 |

## 待补齐（下周）

- 每个任务的 fixture 输入、标准答案、隐藏测试用例落入 `savetoken-quality-token-benchmark-fixtures-2026-08-15.json`。
- 扩展现有 `scripts/run-quality-routing-benchmark.ts`，使其支持本文件的多样验收类型，并按协议跑「Sol 基线 + 执行层」双遍。
- Sol / Luna 真实请求需在额度恢复后授权执行。
