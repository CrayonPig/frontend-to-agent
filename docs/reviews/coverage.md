# 42 篇覆盖矩阵

> 此表保留基线章节覆盖，不能据此认定观测完整实践完成。补齐要求见[详细大纲](../outline.md)，缺口见[观测审计](observability-audit.md)，最新验证见[实施记录](progress.md)。


本表逐篇关联独立增量、正文和示例/审阅证据。程序文件位于 [examples/atlas](https://github.com/CrayonPig/frontend-to-agent/tree/main/examples/atlas)。概念审阅不等于外部能力实测；mock 基线不能证明模型质量或成本优势。最终命令结果见[实施与验证记录](progress.md)。

| 篇号 | 正文 | 本篇新增能力或认识 | 示例/验证证据 | 状态与范围 |
| --- | --- | --- | --- | --- |
| 01 | [01 前端经验能带过来，哪些东西需要重新学](../00-foundations/01-engineering-map.md) | 职责与任务成功边界 | 人工：职责图、五类失败责任表 | 通过（正文与决策审阅）；不适用（外部执行） |
| 02 | [02 组件文档助手的第一张任务清单](../00-foundations/02-assistant-task-list.md) | 固定资料与人工判定 | fixtures.mjs、expectations.mjs；Q01–Q14 | 通过（正文自审与所列合成验证） |
| 03 | [03 一次模型调用里发生了什么](../01-first-call/03-model-call.md) | 上下文与生成生命周期 | 请求生命周期图；真实 token/生成未测 | 通过（正文与决策审阅）；不适用（外部执行） |
| 04 | [04 把第一条请求接进我们的应用](../01-first-call/04-application-request.md) | 浏览器到服务端适配边界 | server.mjs；HTTP 边界测试 | 通过（正文自审与所列合成验证） |
| 05 | [05 Prompt、上下文与输出契约](../01-first-call/05-prompt-contract.md) | 结构和事实分别校验 | core.mjs validateResult；错误版本负例 | 通过（正文自审与所列合成验证） |
| 06 | [06 流式回答的状态，不只有 loading](../01-first-call/06-streaming-state.md) | 部分输出与当前请求终态 | server.mjs 与浏览器状态代码；取消边界 | 通过（正文自审与所列合成验证） |
| 07 | [07 答案看起来不错，怎么判断真的变好了](../02-verifiable/07-evaluation.md) | 分离预期与候选基线 | evaluate.mjs、expectations.mjs、reports/baseline.json | 通过（正文自审与所列合成验证） |
| 08 | [08 HTTP 成功之后，还有哪些失败](../02-verifiable/08-failures.md) | 结果类别与故障恢复 | core.mjs、trace.mjs；无权/未知/结构错误 | 通过（正文自审与所列合成验证） |
| 09 | [09 超时、重试与并发：哪些请求可以再来一次](../02-verifiable/09-request-budget.md) | 有界重试与并发 | trace.mjs；超时远端继续、限流与队列测试 | 通过（正文自审与所列合成验证） |
| 10 | [10 Trace、Observation、Session：一次任务如何串起来](../02-verifiable/10-trace-model.md) | trace/session/task 标识分层 | trace.mjs；父子关系与输出白名单测试 | 通过（正文自审与所列合成验证） |
| 11 | [11 接入 Langfuse：从平台配置到第一条观测链路](../02-verifiable/11-langfuse.md) | Langfuse 生命周期与上报自检 | 官方 SDK 版本核验；外部上报未运行 | 通过（版本核验/严格编译）；未验证（上报） |
| 12 | [12 自动埋点之外，还需要记录哪些业务动作](../02-verifiable/12-instrumentation.md) | 业务埋点与跨边界传播 | trace.mjs 本地记录；外部传播需接入后自检 | 通过（本地白名单）；未验证（平台传播） |
| 13 | [13 文档放进 Prompt 就够了吗](../03-knowledge/13-knowledge-strategy.md) | 知识获取方案选择 | 直接材料/检索/行为训练对比 | 通过（正文与决策审阅）；不适用（外部执行） |
| 14 | [14 文档入库之前，先决定什么不能丢](../03-knowledge/14-document-units.md) | 带版本与权限的文档单元 | fixtures.mjs、core.mjs DocumentStore | 通过（正文自审与所列合成验证） |
| 15 | [15 先用关键词把组件找到](../03-knowledge/15-keyword-search.md) | 过滤先于关键词排序 | core.mjs retrieve；越权候选排除测试 | 通过（正文自审与所列合成验证） |
| 16 | [16 名字不同、意思相近，怎么找到相关资料](../03-knowledge/16-semantic-search.md) | 语义向量的适用范围 | 合成向量算例；真实 embedding 未测 | 通过（算例/方案审阅）；未验证（真实模型检索或重排） |
| 17 | [17 两路结果都有用，如何合并和重排](../03-knowledge/17-hybrid-rerank.md) | 融合与重排的独立作用 | 排序算例；真实 reranker 未测 | 通过（算例/方案审阅）；未验证（真实模型检索或重排） |
| 18 | [18 带引用的答案，真的有依据吗](../04-grounded/18-evidence.md) | 结论与可见证据对应 | validateResult；错误引用、未知、冲突测试 | 通过（正文自审与所列合成验证） |
| 19 | [19 RAG 评测：没找到，还是找到了却答错](../04-grounded/19-rag-evaluation.md) | 检索与生成分层归因 | baseline 逐题记录；真实 RAG 质量未测 | 通过（合成分层记录）；未验证（真实 RAG 质量） |
| 20 | [20 文档更新以后，旧知识怎么退出系统](../04-grounded/20-knowledge-updates.md) | 增量更新与删除屏障 | DocumentStore；修订重放、墓碑、缓存失效测试 | 通过（正文自审与所列合成验证） |
| 21 | [21 权限隔离与文档中的恶意指令](../04-grounded/21-security.md) | 上下文、引用、日志同一权限边界 | Q08/Q09、canRead、Trace 输出白名单 | 通过（正文自审与所列合成验证） |
| 22 | [22 查询实时信息，为什么需要工具](../05-tools/22-live-tools.md) | 实时状态与静态知识分离 | execution.mjs getBuildStatus | 通过（正文自审与所列合成验证） |
| 23 | [23 工具描述是给模型看的，执行校验是给系统做的](../05-tools/23-tool-contract.md) | 工具参数与授权执行端复核 | 额外参数与无权主体拒绝测试 | 通过（正文自审与所列合成验证） |
| 24 | [24 固定流程能完成的任务，先不要交给 Agent](../05-tools/24-workflow.md) | 可重放的固定流程 | execution.mjs runWorkflow | 通过（正文自审与所列合成验证） |
| 25 | [25 从只读到写操作：预览、确认与幂等](../05-tools/25-safe-writes.md) | 预览/确认/幂等的绑定 | DraftStore；内容、身份、期限、重放测试 | 通过（正文自审与所列合成验证） |
| 26 | [26 固定流程的分支越来越多，下一步该由谁决定](../06-agent/26-agent-decision.md) | 是否开放自主决策 | 固定流程与动态动作适用条件 | 通过（正文与决策审阅）；不适用（外部执行） |
| 27 | [27 一个受限的 Agent 循环](../06-agent/27-bounded-loop.md) | 有限动作与预算停止 | runAgent；步数、工具、时间等终止测试 | 通过（正文自审与所列合成验证） |
| 28 | [28 任务中断以后，如何安全继续](../06-agent/28-recovery.md) | 业务恢复与观测分离 | saveCheckpoint/loadCheckpoint；恢复重新授权 | 通过（正文自审与所列合成验证） |
| 29 | [29 和固定工作流做一次公平对比](../06-agent/29-comparison.md) | 公平对比与撤回条件 | 对比设计；未宣称真实 Agent 胜出 | 通过（正文自审与所列合成验证） |
| 30 | [30 复盘一次失败的 Agent 任务](../06-agent/30-failure-review.md) | 失败归因与可复现回归 | 失败任务、版本、动作与回执核对 | 通过（正文自审与所列合成验证） |
| 31 | [31 上下文不是越多越好](../07-capabilities/31-context.md) | 上下文选择不改写证据 | governance.mjs assembleContext | 通过（正文自审与所列合成验证） |
| 32 | [32 这次任务的状态，和下次还要记住的信息](../07-capabilities/32-memory.md) | 记忆范围/来源/期限/删除 | MemoryStore；隔离、过期、删除测试 | 通过（正文自审与所列合成验证） |
| 33 | [33 把重复做事的方法整理成 Skill](../07-capabilities/33-skills.md) | 有边界的可复用操作知识 | 正文 Skill 示例；非自动执行代理 | 通过（Skill 产物与静态检查）；未验证（模型触发） |
| 34 | [34 工具越来越多，MCP 解决哪一层的问题](../07-capabilities/34-mcp.md) | 协议与业务执行职责区分 | 官方 MCP 版本核验；无外部协议服务器 | 通过（官方规范核验）；未验证（协议接入） |
| 35 | [35 要不要拆成多个 Agent](../07-capabilities/35-multi-agent.md) | 多 Agent 的比较设计 | 选读实验方案；未运行多 Agent 产品 | 通过（实验方案审阅）；不适用（运行比较） |
| 36 | [36 流式更快，不代表任务完成更快](../08-operations/36-latency.md) | 端到端延迟与统计口径 | percentile；合成样本统计非线上 SLO | 通过（合成统计）；未验证（线上延迟） |
| 37 | [37 缓存命中以后，答案还能不能用](../08-operations/37-cache.md) | 缓存命中重新检查有效性 | ScopedCache；权限/版本/删除/TTL 测试 | 通过（正文自审与所列合成验证） |
| 38 | [38 不是每次调用便宜，而是每次成功任务划算](../08-operations/38-cost.md) | 成功任务成本与未知值 | costSummary；未知不按零计算 | 通过（正文自审与所列合成验证） |
| 39 | [39 Prompt 改了，如何知道哪一版影响了结果](../08-operations/39-prompt-versions.md) | 不可变版本与发布标签 | PromptRegistry；标签门槛测试；外部未上报 | 通过（本地门禁）；未验证（外部 Prompt 服务） |
| 40 | [40 一次变更如何安全上线](../08-operations/40-release.md) | 完整版本清单与回滚边界 | 发布检查清单；mock 回归与文档构建 | 通过（局部门禁与设计审阅）；未验证（生产发布） |
| 41 | [41 一次问题经过了哪些模块](../09-integration/41-architecture.md) | 请求流和知识更新流整合 | 实际/可选架构与责任表 | 通过（正文自审与所列合成验证） |
| 42 | [42 如何证明这个知识助手可以交给别人使用](../09-integration/42-handoff.md) | 他人可复现的交付边界 | 示例 README、基线、测试与本报告 | 通过（本地交付）；未验证（外部集成/浏览器交互） |

## 验收边界

所有实际运行使用原创合成资料。真实模型、Langfuse 上报、Elasticsearch 服务、MCP 协议接入、生产身份系统与跨进程事务不由本地测试证明。源码节选只解释对应行为，完整程序以 examples/atlas 为准；外部 API 示例均按正文标明的版本和日期核验。

[返回学习目录](../README.md)
