# SaveToken DeepSeek 基准半边 + v4-pro 探测 — 2026-08-15

本报告是「仅 DeepSeek 可用」窗口的收尾证据。两部分：12 任务基准的 DeepSeek 执行层半边（9 个任务），以及 `deepseek-v4-pro` 的可达性与严格 schema 探测。

## FACT

### 基准半边（deepseek-v4-flash，9 任务）

结果：8 PRESENT / 1 FAILED。失败项 SUM-04（有界摘要）：输出 33 字（>30 字上限）、漏掉「C919」与「商业航线」两个必备实体，且消耗 1236 个 reasoning token（输出总计 1260）。

| id | 类别 | 通过 | reasoning tokens | 总输出 tokens |
| --- | --- | --- | --- | --- |
| EXT-01 | 提取 | ✅ | — | — |
| CLS-02 | 分类 | ✅ | — | — |
| FMT-03 | 转换 | ✅ | 76 | 126 |
| SUM-04 | 摘要 | ❌ | 1236 | 1260 |
| SCH-05 | 严格 JSON 对象 | ✅ | 113 | 127 |
| SCH-06 | 严格 JSON schema（纯提示） | ✅ | 70 | 81 |
| TOOL-07 | 单工具 | ✅ | — | — |
| TOOL-08 | 多轮工具 | ✅ | — | — |
| TRA-12 | 翻译 | ✅ | 181 | 191 |

关键 token 事实：文本任务（摘要、翻译）的 reasoning token 占输出绝对大头（TRA-12 为 181/191；SUM-04 为 1236/1260），reasoning 开销是 v4-flash 的主要 token 成本。

### v4-pro 探测

- P1 可达性：200，model=deepseek-v4-pro，输出正确。
- P2 严格 json_schema（`strict:true` + `additionalProperties:false`）3 次：**3/3 PRESENT**，每次输出键严格为 `[pages,title]` 且类型正确。

对比：同一带 `response_format json_schema` + `additionalProperties:false` 的条件下，v4-flash 在 2026-08-15 深验证中 2/2 失败（一次多 7 字段、一次 markdown 代码围栏）。

## INFERENCE

1. **严格结构化能力边界真实存在且可复现**：`deepseek-v4-pro` 遵守 `additionalProperties:false`（3/3），`deepseek-v4-flash` 不遵守（2/2 失败）。可据此细化路由：严格 schema 提取应指向 `deepseek-v4-pro` 或更高层模型，廉价高容忍文本用 `v4-flash`。
2. **v4-flash 的 reasoning token 开销是「省 token」论点的最大障碍**：文本任务 reasoning token 占输出 90% 以上，SUM-04 更是 1236 reasoning token 仍失败。这佐证早前校准结论（DeepSeek 因推理开销反而更费 token），但需下周 Sol 基线对比才能定量。
3. 基准 SCH-05 / SCH-06 本轮用「纯提示」通过，与深验证「带 schema 失败」不矛盾：纯提示属弱约束、单样本；带 `response_format json_schema` 才是真正考验 schema 遵从。

## UNKNOWN / 未验证

- 每类任务仅 1 个样本，按项目决策规则（每类 ≥2 才能下类别级结论），SUM-04 失败与各 token 数字是「观察值」，不是类别级定论。
- Sol 基线、Luna（CODE-09/TEST-11）、Terra（CODE-10）尚未运行（OpenAI 额度）。
- v4-pro 的流式、工具、取消、错误映射、成本配额均未测。

## 交付物

| 文件 | SHA-256 |
| --- | --- |
| `docs/superpowers/evidence/savetoken-deepseek-benchmark-side-2026-08-15.json` | `2DF27804DC1EF14687201685A20A37558AB0131850C4992C5A03C1EA9E7121CB` |
| `docs/superpowers/evidence/savetoken-deepseek-v4-pro-probe-2026-08-15.json` | `4A3A05EF34538D73B3BBDE78ECD0C5CE16C3B0FF8C3228B19AC59C50D113DB8E` |
| `savetoken-runtime/scripts/run-deepseek-benchmark-side.ts` | `94AD308423B997E84B50E755A40EC8735B0064739C3B53C80BC7CC0F083949EE` |
| `savetoken-runtime/scripts/probe-deepseek-v4-pro.ts` | `1913AEBF8735F10ACA5AAA80A7F5CBDB277F7D2A8D445F1CB2B145D3BA7BD710` |

未提交、未推送、未发布、未部署。
