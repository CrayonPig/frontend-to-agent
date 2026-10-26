# 学习目录

围绕同一个 Atlas 组件/API 知识助手，按任务暴露的问题逐步增加能力。42 篇正文按下列 10 部分组织；[详细大纲与观测实践路线](outline.md)规定逐篇操作、观察结果与验收。章节存在与完整实践通过是不同状态，实际范围见[覆盖矩阵](reviews/coverage.md)和[交付验收](09-integration/42-handoff.md)。默认运行路径使用合成数据与确定性 mock，不需要真实模型密钥。

## 00 起点：我们要让助手解决什么

- [01 前端经验能带过来，哪些东西需要重新学](00-foundations/01-engineering-map.md)
- [02 组件文档助手的第一张任务清单](00-foundations/02-assistant-task-list.md)

## 01 第一次调用：模型究竟给了我们什么

- [03 一次模型调用里发生了什么](01-first-call/03-model-call.md)
- [04 把第一条请求接进我们的应用](01-first-call/04-application-request.md)
- [05 Prompt、上下文与输出契约](01-first-call/05-prompt-contract.md)
- [06 流式回答的状态，不只有 loading](01-first-call/06-streaming-state.md)

## 02 先让它可检验，再让它更复杂

- [07 答案看起来不错，怎么判断真的变好了](02-verifiable/07-evaluation.md)
- [08 HTTP 成功之后，还有哪些失败](02-verifiable/08-failures.md)
- [09 超时、重试与并发：哪些请求可以再来一次](02-verifiable/09-request-budget.md)
- [10 Trace、Observation、Session：一次任务如何串起来](02-verifiable/10-trace-model.md)
- [11 接入 Langfuse：从平台配置到第一条观测链路](02-verifiable/11-langfuse.md)
- [12 自动埋点之外，还需要记录哪些业务动作](02-verifiable/12-instrumentation.md)

## 03 模型不知道我们的知识，怎么办

- [13 文档放进 Prompt 就够了吗](03-knowledge/13-knowledge-strategy.md)
- [14 文档入库之前，先决定什么不能丢](03-knowledge/14-document-units.md)
- [15 先用关键词把组件找到](03-knowledge/15-keyword-search.md)
- [16 名字不同、意思相近，怎么找到相关资料](03-knowledge/16-semantic-search.md)
- [17 两路结果都有用，如何合并和重排](03-knowledge/17-hybrid-rerank.md)

## 04 找到资料之后，仍然可能答错

- [18 带引用的答案，真的有依据吗](04-grounded/18-evidence.md)
- [19 RAG 评测：没找到，还是找到了却答错](04-grounded/19-rag-evaluation.md)
- [20 文档更新以后，旧知识怎么退出系统](04-grounded/20-knowledge-updates.md)
- [21 权限隔离与文档中的恶意指令](04-grounded/21-security.md)

## 05 文档回答不了的事，交给受控工具

- [22 查询实时信息，为什么需要工具](05-tools/22-live-tools.md)
- [23 工具描述是给模型看的，执行校验是给系统做的](05-tools/23-tool-contract.md)
- [24 固定流程能完成的任务，先不要交给 Agent](05-tools/24-workflow.md)
- [25 从只读到写操作：预览、确认与幂等](05-tools/25-safe-writes.md)

## 06 哪些任务值得让 Agent 决定下一步

- [26 固定流程的分支越来越多，下一步该由谁决定](06-agent/26-agent-decision.md)
- [27 一个受限的 Agent 循环](06-agent/27-bounded-loop.md)
- [28 任务中断以后，如何安全继续](06-agent/28-recovery.md)
- [29 和固定工作流做一次公平对比](06-agent/29-comparison.md)
- [30 复盘一次失败的 Agent 任务](06-agent/30-failure-review.md)

## 07 任务更长之后，需要管理什么

- [31 上下文不是越多越好](07-capabilities/31-context.md)
- [32 这次任务的状态，和下次还要记住的信息](07-capabilities/32-memory.md)
- [33 把重复做事的方法整理成 Skill](07-capabilities/33-skills.md)
- [34 工具越来越多，MCP 解决哪一层的问题](07-capabilities/34-mcp.md)
- [35 要不要拆成多个 Agent](07-capabilities/35-multi-agent.md)

## 08 质量稳定之后，再谈系统性优化

- [36 流式更快，不代表任务完成更快](08-operations/36-latency.md)
- [37 缓存命中以后，答案还能不能用](08-operations/37-cache.md)
- [38 不是每次调用便宜，而是每次成功任务划算](08-operations/38-cost.md)
- [39 Prompt 改了，如何知道哪一版影响了结果](08-operations/39-prompt-versions.md)
- [40 一次变更如何安全上线](08-operations/40-release.md)

## 09 回到全局：把这些能力重新连起来

- [41 一次问题经过了哪些模块](09-integration/41-architecture.md)
- [42 如何证明这个知识助手可以交给别人使用](09-integration/42-handoff.md)

## 怎么使用这份系列

先读 01–02 明确任务与事实边界，再运行合成示例；每次只改变一个条件，留下失败样例、版本与判定理由。35 为可选决策篇，Elasticsearch、Langfuse、MCP 和真实模型都是按需接入，不是完成阅读的前提。

旧文章链接保留为[迁移入口](reviews/migration.md)，不再把旧导读当作独立的完整正文。

[实施记录](reviews/progress.md) · [版本与来源](reviews/sources.md) · [站点开发与部署](contributing.md)
