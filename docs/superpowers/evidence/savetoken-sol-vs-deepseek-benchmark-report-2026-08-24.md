# SaveToken Sol vs DeepSeek 基准对比报告

Date: 2026-08-24
Instrument: frozen `quality-token-v2-r1-r5`（24 任务 / 12 类别，每类 2 个 held-out 实例）
Both runs verified by `verifyFrozenBenchmarkInstrument` (SHA-256 match) before any request.

## 结论（先给答案）

“执行层省 token 且质量不降”的立论 **不成立**。实测相反：

- 质量：DeepSeek 通过 **20/24（83.3%）**，Sol 通过 **17/24（70.8%）**。DeepSeek 略高。
- Token：DeepSeek 总计 **11832**，Sol 总计 **3081**。DeepSeek 是 Sol 的 **3.84 倍**，不是更省，而是更贵。

即：本轮默认配置下，把执行任务路由到 DeepSeek 会**多花约 3.84 倍 token**，换来的通过率略高于 Sol，但不足以证明“降本”。DeepSeek 响应未回显实际 effort；`high` 仅为 catalog 默认标注，不作为已验证事实。

## FACT

### 运行环境

- OpenCodex `/healthz` 200（2.11.0，ok），`/readyz` 200（ready），端口 10100。
- `/v1/models` 200，`deepseek/deepseek-v4-flash` 与 `gpt-5.6-sol` 均可见。
- bun 1.3.14（`savetoken-runtime\node_modules\.bin\bun.exe`）。
- 冻结仪器四文件 SHA-256 与报告一致，未改动。

### DeepSeek 基线（deepseek/deepseek-v4-flash，默认 effort，未传 reasoning_effort）

- 24 任务：20 PRESENT / 4 MISSING / 0 UNKNOWN。
- 模型身份全部 `deepseek-v4-flash`，HTTP 全部 200。
- 响应 effort：`UNKNOWN`（DeepSeek 响应未回显 effort 字段）。
- Token：input 5138 / output 6694 / reasoning 5688 / **total 11832**。
- MISSING 4 项：
  - SUM-04 摘要：33 字 > 30 字上限。
  - TOOL-08 多轮工具：工具已调用，最终答案缺 `sunny`。
  - CODE-10 缺陷定位：缺 `m = 0` / `负数` / `初始化` 之一。
  - TRA-12 翻译：缺 `央行` / `存款准备金` 之一。

### Sol 基线（gpt-5.6-sol，实际 effort=medium）

- 24 任务：17 PRESENT / 7 MISSING / 0 UNKNOWN。
- 模型身份全部 `gpt-5.6-sol`，HTTP 全部 200。
- 响应 effort：一致 `medium`。
- Token：input 1699 / output 1382 / reasoning 465 / **total 3081**。
- MISSING 7 项：SUM-04、TOOL-08、CODE-10、TEST-11、TOOL-20、CODE-22、TEST-23。

### 协议差异（重要发现）

DeepSeek 与 Sol 在 OpenCodex 代理里走的是不同协议路径：

- DeepSeek：`input` 为字符串，返回 JSON。
- Sol：必须 `input` 为对象列表、`store:false`、`stream:true`，返回 SSE（`text/event-stream`），且 `store:false` 时 `response.completed.output` 为空，输出需从 `response.output_item.done` 事件重建。

因此冻结的 DeepSeek runner **不能原样跑 Sol**。Sol 基线用的是同一份冻结 fixtures + 同一冻结 evaluator（`evaluateBenchmarkAcceptance`），仅传输层按 Sol 协议适配（`transport: sol-sse-store-false`）。

### 逐类对比（通过数 DeepSeek / Sol）

| 类别 | DeepSeek | Sol |
| --- | ---: | ---: |
| extraction | 2/2 | 2/2 |
| classification | 2/2 | 2/2 |
| transform | 2/2 | 2/2 |
| summarization | 1/2 | 1/2 |
| strict-json-object | 2/2 | 2/2 |
| strict-json-schema | 2/2 | 2/2 |
| tool-single | 2/2 | 2/2 |
| tool-multi-turn | 1/2 | 0/2 |
| code-simple | 2/2 | 2/2 |
| code-bug | 1/2 | 0/2 |
| test-design | 2/2 | 0/2 |
| translation | 1/2 | 2/2 |

## INFERENCE

- 本轮默认配置下，DeepSeek 的 reasoning 成本极高：仅摘要一项就 4039 reasoning + 4064 output。这是 DeepSeek 总 token 被拉到 Sol 3.84 倍的主因。catalog 默认标注为 `high`，但响应未回显 effort，因此实际 effort 仍为 `UNKNOWN`。
- Sol 的 catalog 标注默认 effort 为 `low`，但实际响应 effort 是 `medium`；这是 OpenCodex catalog 与实际行为不一致，需单独排查。
- 通过率差异（20 vs 17）来自单次运行，模型有非确定性；是否稳定需多次运行，本轮未做。

## UNKNOWN

- DeepSeek 实际 effort 无法从响应读回（回显 `UNKNOWN`），“high”来自 catalog 默认 + 巨量 reasoning token 的推断，未直接验证。
- “DeepSeek 用 low effort 是否能真正省 token”本轮未测：本基准只跑 default effort。此前 Calibration 显示 low 的省 token 效果因任务类型而异，不能外推。
- Sol/DeepSeek 各仅 1 次运行，通过率差异的统计显著性未知。
- 真实 Provider 配额、计费单价、跨平台 hosted CI、取消上游传播仍为 UNKNOWN。

## 硬约束遵守情况

- 未修改 `work/opencodex-upstream`。
- 未提交 / 推送 / 发布 / 部署。
- 未读取、输出或保存任何 API Key / Cookie / Token / 私密配置。
- 未修改任何冻结文件；Sol 传输层为新增独立脚本。

## 证据文件

- `docs/superpowers/evidence/savetoken-quality-token-benchmark-deepseek-deepseek-v4-flash-2026-08-24.json`
- `docs/superpowers/evidence/savetoken-quality-token-benchmark-gpt-5.6-sol-2026-08-24.json`
- `docs/superpowers/evidence/savetoken-sol-vs-deepseek-benchmark-report-2026-08-24.md`
- `savetoken-runtime/scripts/run-sol-benchmark-side.ts`（复用冻结 evaluator 的 Sol SSE 传输 runner）

## Closure verification

- 唯一项目目录实际门禁：`typecheck` 退出码 0；`bun test` 308 pass / 0 fail / 72 files；`lint` 退出码 0；`privacy:scan` 0 hits；`package:check` 退出码 0（allowed 135 / excluded 657 / missing 0）。
- 曾有一次门禁命令未切换工作目录，误在 `C:\Users\ASUS\Documents\ChatGPT\savetoken项目组` 运行，产生 97 pass / 8 fail；该结果属于错误工作区，已明确排除，不作为本项目验收证据。
- OpenCodex upstream commit：`57140d6f06218d604ee139e5909a1b868bf7a84b`；显式 `--git-dir/--work-tree` 状态输出为空，未修改 upstream。
- 本次 closure 未发送新的真实 Provider 请求；仅迁移已有证据、归档 runner 并执行本地门禁。

### SHA-256

- DeepSeek evidence: `9871850EAAFE67B2653307307D1ECAA84311E4BA332A362B4D59C66A0558A0CE`
- Sol evidence: `3DCD54AF93B83B3A0EC5997DB0D36954AE8701B464C4223092A7B79EB5C0EE46`
- Sol runner: `9F4E00276303FEC1A7FDDD71F852A526A23FB240D64BAA815E71143E0AA65FC6`
