# 第 31–40 篇内容与验证记录

> 历史审阅记录：本文描述基线提交的实现，不代表后续观测实践已完成。修订缺口见[观测审计](observability-audit.md)，最新操作与状态见[详细大纲](../outline.md)和[验证记录](progress.md)。


核对日期：2026-10-26。本记录区分已经执行的本地验证、解释性设计与未运行的外部集成。所有任务、文档、租户与用户标识均为 Atlas 合成数据。

## 交付覆盖

| 篇号 | 主要产出 | 可复现证据与边界 |
| --- | --- | --- |
| 31 | 分层上下文、必需证据与预算、摘要追溯 | `assembleContext` Q14 双证据与预算失败演练已执行；字符预算非 tokenizer，原子组仅显式教学任务 |
| 32 | 状态/历史/记忆分离、来源/过期/删除/冲突规则 | `MemoryStore` 隔离、过期、删除命令已执行；偏好白名单、确认、CAS 与持久化仅设计 |
| 33 | 完整原创 `atlas-version-usage` Skill 及输出参考 | `examples/atlas/skills/skill-artifact.test.mjs` 1 项通过；未安装到宿主，未验证真实模型触发 |
| 34 | 业务执行器与 MCP 协议适配职责对照 | 已核对官方 2026-07-28 规范；适配示意未运行，没有 MCP 服务或 SDK 集成 |
| 35 | 单 Agent、固定并行、多 Agent 的公平实验方案 | 决策篇；没有真实模型对比，未宣称多 Agent 收益 |
| 36 | 关键路径、首可用信息、分布与样本口径 | 合成数组最近秩 p50=190、p95=900 已计算；没有线上延迟实测 |
| 37 | 多层缓存、实际依赖、撤权与删除失效 | 内存缓存删除后读取演练已执行；非分布式缓存，没有供应商缓存能力声明 |
| 38 | 已知/未知费用、任务分母、质量联合比较 | `costSummary` 未知费用传播已执行；所有数字为抽象单位，没有真实价格/账单 |
| 39 | 不可变版本、可移动标签、实际 generation 关联与 fallback | `PromptRegistry` 拒绝失败回归推广并保留旧版已执行；Langfuse 6.0.2 接入代码经官方形状核验但未连接服务 |
| 40 | 组合发布记录、质量门禁、分流设计与状态回退 | 完整发布运营为设计，运行库仅有 Prompt 版本门禁，不宣称真实小流量/生产上线 |

## 已执行的本地检查

在仓库根目录、当前 Node 环境运行：

- `node --test examples/atlas/skills/skill-artifact.test.mjs`：1 个测试通过。检查 Skill 元数据、引用文件存在与基本边界；不是模型行为评测。
- 第 31 篇上下文命令：输出 `true`、`context_budget`。
- 第 32 篇记忆命令：输出 `table`、`null`、`null`、`null`。
- 第 36 篇合成最近秩计算：输出 `190 900`。
- 第 37 篇缓存命令：输出 `answered`、`null`。
- 第 38 篇成本命令：`total: null`、`knownSubtotal: 10`、`unknownCount: 1`、`successfulTasks: 1`、`costPerSuccess: null`。
- 第 39 篇版本门禁命令：输出 `release_gate`、`1`。

以上是本地确定性数据结构与算术验证，不代表模型事实能力、真实授权系统、实际 Langfuse 上报、MCP 互操作或生产性能验证。整站构建及其他运行库测试由集成任务记录，不在此提前声称通过。

## 官方核验来源

| 主题 | 核验内容 | 一手来源 |
| --- | --- | --- |
| Skills 格式 | 目录、SKILL.md、name/description、按需资源；未擅自添加许可证 | [Agent Skills specification](https://agentskills.io/specification) |
| Skills 方法 | 操作知识、按需读取与任务检验 | [Anthropic 官方介绍](https://www.anthropic.com/research/equipping-agents-for-the-real-world-with-agent-skills) |
| MCP 版本 | 当前版本 2026-07-28；逐请求版本声明，与早期握手版本区分 | [版本规则](https://modelcontextprotocol.io/docs/2026-07-28/learn/versioning) |
| MCP 范围 | host/client/server、上下文交换与业务决策分离 | [架构文档](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture) |
| Langfuse 依赖 | @langfuse/client 6.0.2，Node >=22，core/tracing ^6.0.2，OTel API peer ^1.9.0 | [npm 官方元数据](https://registry.npmjs.org/@langfuse/client/6.0.2) |
| Prompt 读取/编译 | `LangfuseClient`、`prompt.get`、`compile` | [官方入门](https://langfuse.com/docs/prompt-management/get-started) |
| Prompt 版本/标签 | 精确版本与可移动标签，默认 production 与 latest 的区别 | [官方版本控制](https://langfuse.com/docs/prompt-management/features/prompt-version-control) |
| generation 关联 | `startActiveObservation`、`generation.update({ prompt })`、asType generation | [官方 trace 关联](https://langfuse.com/docs/prompt-management/features/link-to-traces) |
| Prompt 缓存 | 标签变化与运行实例读取的内容需区分 | [官方缓存说明](https://langfuse.com/docs/prompt-management/features/caching) |
| 用量费用 | 使用量与费用来源不同，模型费用非系统总成本 | [官方 Token 与费用文档](https://langfuse.com/docs/observability/features/token-and-cost-tracking) |

各来源于上述日期重新读取；没有仅从 URL 推断版本。Langfuse 可选接入与第 11 篇统一 v6 系列，不混用旧 `langfuse` SDK 或 Python 初始化代码；实际依赖安装和服务端最低版本遵循第 11 篇。本文未调用任何付费模型，未配置密钥，未创建账号。

## 内容自审

- 保留 AtlasButton 1.4 的 `loading`、2.0 的 `pending`；两个版本均由 `disabled` 负责阻止 click。
- AtlasTable 2.0 的虚拟滚动、排序与上限保持未知；未引入所谓 `virtual` 已存在的事实。
- Q14 冲突卡仅用于该题，不能用投票或压缩丢一侧来消除冲突；X-T20 仍为不可信测试资料。
- 记忆、缓存、Skill 与 MCP 都不授予权限；授权来源与执行端校验未搬到 Prompt。
- 工具动作、任务结果、质量评分分开；不记录私密推理。
- 实际产物与设计扩展分别标注；Node 命令可直接从仓库根目录运行。
