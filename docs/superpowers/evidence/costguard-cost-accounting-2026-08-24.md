# CostGuard 美元成本计量 — 2026-08-24

本文件把「省 token」与「省钱」区分开，并用冻结基准的 token 数乘以公开单价，给出美元成本估算。

## 结论先行

- 「省 token」不成立：DeepSeek 用 11,832 token，是 Sol（3,081）的 **3.84 倍**。
- 「省钱」成立：按公开单价，DeepSeek 本轮约 **$0.0026**，Sol 约 **$0.034–0.050**。DeepSeek 便宜约 **13–19 倍**。
- 原因：DeepSeek 单价极低（输入约便宜 35×、输出约便宜 100×），足以覆盖 3.84 倍的 token 溢出。

## FACT（单价，来自公开定价页，随时可能变动）

| 模型 | 输入 $/1M | 输出 $/1M |
| --- | ---: | ---: |
| DeepSeek-V4-Flash | $0.14（cache miss） | $0.28 |
| GPT-5.6 Sol（API 价） | $5.00 | $30.00 |
| GPT-5.6 Sol（Codex token 价） | $4.00 | $20.00 |

`gpt-5.6-sol` 存在 API 与 Codex 两套费率，故 Sol 成本按区间呈现。

## FACT（美元计算）

基准 token 数（已核实）：DeepSeek input 5,138 / output 6,694；Sol input 1,699 / output 1,382。reasoning 计入 output。

| 模型 | input 成本 | output 成本 | 合计 |
| --- | ---: | ---: | ---: |
| DeepSeek-V4-Flash | $0.000719 | $0.001874 | **$0.002594** |
| GPT-5.6 Sol（API） | $0.008495 | $0.041460 | $0.049955 |
| GPT-5.6 Sol（Codex） | $0.006796 | $0.027640 | $0.034436 |

成本比（Sol ÷ DeepSeek）：API 口径 ≈ **19.3×**；Codex 口径 ≈ **13.3×**。

## INFERENCE

- 项目定位应从「省 token」改为「省钱 + 安全分级」。省钱由单价差驱动，不是由 token 数驱动。
- 高质量通过率（DeepSeek 83.3% vs Sol 70.8%）叠加更低的美元成本，说明把低风险执行任务路由到 DeepSeek 是合理的成本决策；但这不改变 fail-closed 的必要性——高风险任务仍不能降级。

## UNKNOWN / 边界

- 单价来自公开页面，账户与实际计费（尤其 ChatGPT Plus 的 credit 计费）可能不同，本计算是估算，不是账单。
- `gpt-5.6-sol` 对当前账户的准确单价未从账户读回。
- token 数与通过率来自单次运行，统计稳定性未验证。
