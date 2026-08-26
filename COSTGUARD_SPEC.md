# CostGuard 冻结规格

状态：冻结设计约束 v0.1
日期：2026-08-08
实现状态：未完成；本文件是目标与验收合同，不是已实现功能声明。

## 1. 名称与目标

最终名称：`CostGuard`。

> 改名说明：项目价值从「省 token」更正为「省钱 + 安全分级」。活动运行时代码、命令、目录和环境变量统一使用 `CostGuard` / `COSTGUARD_*`；历史 SaveToken 证据保持原字节归档，旧环境变量只由 `doctor` 检测并给出迁移说明，不作为运行时别名。

目标：在 ChatGPT Plus/Codex 环境中，以 OpenCodex 的功能为基线，建立可开源、可复现、自动分级、可回退、可验收的多模型 Agent 工作流，按任务风险与美元成本分级路由以降低总花费，并用 fail-closed 与质量闸门保证不静默降低交付质量。

> 冻结基准结论（2026-08-24）：默认配置下「省 token」不成立（DeepSeek 用 11,832 token，为 Sol 的 3.84 倍）；但「省钱」成立（DeepSeek 约 $0.0026 vs Sol 约 $0.034–0.050，便宜约 13–19 倍）。详见 `docs/superpowers/evidence/costguard-cost-accounting-2026-08-24.md`。

“完全蒸馏复刻”解释为功能和行为契约复刻，不是复制上游密钥、账户状态、私有数据或未经许可的外部服务凭据。

## 2. 上游基线

审计对象：`lidge-jun/opencodex`。

本次只读审计基线：

- package version：`2.11.0`；
- git commit：`57140d6f06218d604ee139e5909a1b868bf7a84b`；
- license：MIT；
- 运行时：Bun-native TypeScript；
- 结构规模：约 490 个 `src` 文件、650 余个测试文件、GUI 和文档站点。

上游功能范围必须逐项审计并通过后，才允许写“功能复刻完成”：

1. Provider 配置、模型发现、`provider/model` 路由和默认 Provider；
2. Codex `config.toml`、`CODEX_HOME`、模型 catalog、缓存、备份、恢复和幂等注入；
3. Responses、Chat Completions、Anthropic Messages、图片、流式事件、工具调用、取消和错误映射；
4. Provider adapters、OAuth、API Key、Key pool、账户池、配额、冷却和健康状态；
5. combos、failover、round-robin、subagentModels、v1/v2 协作界面、fallback chain、effort 上限；
6. Web-search / vision sidecars；
7. CLI、Dashboard、management API、日志、usage、doctor、health、ready；
8. Windows/macOS/Linux service、shim、启动、停止、恢复、卸载和崩溃重启；
9. 安全边界、密钥环境变量、原子写入、隐私扫描、跨平台测试和文档同步。

## 3. 冻结的模型层级

| 层级 | 模型 | 允许职责 | 禁止职责 |
| --- | --- | --- | --- |
| 5 | GPT-5.6 Sol | 最高难度、架构、安全、重大重构、其他模型无法解决的堵点 | 批量搬运、普通提取、低价值重复工作 |
| 4 | GPT-5.6 Terra | 中等复杂方案、代码分析、测试规划、跨文件但边界清晰的工作 | 最高风险决策；遇到堵点必须升级 Sol |
| 2-3 | GPT-5.6 Luna / DeepSeek V4 | 平级执行层：明确编码、批量处理、提取、分类、整理 | 架构、安全、权限、最终风险裁决 |
| 1 | 智谱 GLM | 其他模型不可用或额度耗尽时的低风险最终备用 | 接管高风险任务、静默降低验收标准 |

Luna 与 DeepSeek 是调度层级平级，不代表能力和工具兼容性相同。默认按任务形态选择：纯文本和批量提取优先 DeepSeek；Codex 文件、工具和工程执行优先 Luna。任一模型不可用时，执行层可互相回退。

智谱只能作为最后备用。高风险任务没有 Sol/Terra 可用时必须失败关闭并报告 `UNKNOWN`，不能自动降级到智谱。

## 4. Plus 模式约束

当前用户是 ChatGPT Plus，不是 ChatGPT Pro。

- 不把外部 ChatGPT Pro、Extra High 或 Pro 专属额度作为默认前置条件；
- 不声称 Plus 拥有 Pro 的模型、额度或托管能力；
- 优先使用 Plus/Codex 实际可用的 Sol、Terra、Luna 和已验证的 OpenCodex Provider；
- 外部 Pro 复核只能是可选模式，不能进入 Plus 的必经路径；
- 模型目录出现不等于账户有权调用，必须用真实请求验证。

## 5. 自动路由规则

路由必须采用“确定性风险门槛优先、模型判断其次”的两阶段方式：

1. 先检查任务是否包含架构、安全、权限、数据迁移、生产、跨模块、重大重构或明确堵点；命中即进入 Terra/Sol 路径，不得先交给最低成本模型；
2. 再按任务规模、工具需求、重复性、上下文量和可验收性选择执行层；
3. 信息不足或分类结果冲突时升级 Terra；Terra 仍不能判断时升级 Sol；
4. worker 只执行父代理给出的边界，不重新定义目标；
5. 不为小任务启动多个 Agent；
6. OpenCodex 的 `subagentModels` 只能作为可见模型和显式委派入口，不能被当作自动任务分类器；
7. OpenCodex 的 combo/failover 只能用于明确允许回退的执行层，不能让 Sol 的高风险任务静默降级。

## 6. 冻结的质量闸门

每个任务必须满足：

- 有目标、范围、非目标和可逐项验收标准；
- 批量任务先抽样校准，再全量执行；
- 代码任务执行相关 lint、类型检查、单元测试、构建、合同测试或 E2E；
- 文档和研究任务保留来源、异常、覆盖范围和未验证项；
- 所有结论标记 `FACT`、`INFERENCE` 或 `UNKNOWN`；
- worker 报告实际修改、实际运行命令、错误、假设和未验证项；
- 高风险结果由主代理独立审查，不能把 worker 自评当作验收；
- 发生越界、矛盾、低置信度、测试失败或 Provider 不稳定时升级；
- 未经过实际运行验证，不得声称“调用成功”“通过”“完成”“安全”或“质量不降”。

“质量不降低”不是宣传语，必须通过基准任务集证明：关键验收项不得比 Sol 基线少通过；若路由结果失败，必须能复现、升级并保留失败证据。

## 7. 安全与隐私硬约束

- 不把 API Key、OAuth、Cookie、Token、私钥、浏览器状态或真实用户数据写入仓库；
- 配置只允许环境变量引用，例如 `${DEEPSEEK_API_KEY}`；
- OpenCodex 默认只绑定本机回环地址；对外绑定必须有显式认证和安全测试；
- 不自动提交、推送、创建 PR、部署、迁移数据库或修改生产配置；
- 任何曾在聊天中明文出现的密钥都视为已暴露，不得进入 `CostGuard` 发布包；
- 开源包必须保留 OpenCodex MIT 许可和归属说明，并明确其独立社区项目身份；
- 不把 Provider 的订阅限制、代理限制或账户可用性写成普遍保证。

## 8. 实施分期与完成门槛

### 阶段 A：上游功能盘点

建立“上游模块 → CostGuard 模块 → 测试证据”的逐项映射。没有映射的功能标记 `MISSING`，不能写成已复刻。

### 阶段 B：运行时复刻层

先复刻 OpenCodex 的代理、配置、路由、catalog、Provider、服务、恢复和诊断契约；每个子系统必须有 focused regression test。

### 阶段 C：CostGuard 编排层

加入模型层级、任务分级、worker 边界、升级规则、质量闸门、证据日志和 Plus 模式。编排层不能修改 OpenCodex 的底层 Provider 契约来伪造成功。

### 阶段 D：真实运行验证

逐一验证原生 OpenAI/Codex、Sol、Terra、Luna、DeepSeek、智谱；至少验证健康检查、模型发现、普通请求、工具调用、流式结束、失败回退和恢复原配置。

### 阶段 E：开源发布门槛

只有以下条件全部满足，才允许公开发布 `CostGuard`：

- 上游功能矩阵没有未解释的 `MISSING`；
- 路由和质量基准通过；
- Windows、macOS、Linux 的适用测试通过；
- 密钥和隐私扫描通过；
- 安装、升级、回退、卸载可重复；
- 文档明确列出已验证、未验证、Provider 限制和账户要求；
- 不把“省钱”宣传成“替代 ChatGPT Pro 权益”，也不把未计量的美元节省写成确定结论。

## 9. 当前未知项

- 当前 Plus 账户在本机是否实际拥有每个 GPT-5.6 模型和 effort 档位；
- 当前 OpenCodex 服务、Codex home、catalog 和 provider 是否已经完全一致；
- DeepSeek V4、Luna 和智谱在真实工具调用、长上下文和错误恢复中的可比质量；
- OpenCodex 上游未来版本对配置、子代理和 provider 契约的变更；
- 其他 Provider 是否允许通过代理使用其订阅或 API 计划；
- `CostGuard` 是否最终采用上游 fork、依赖上游包，还是独立兼容实现。

在这些项被实测前，`CostGuard` 只能称为“冻结方案”，不能称为“完整复刻”或“可替代 Pro”。
