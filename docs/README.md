# 学习目录

从已有工程经验出发，先建立可靠应用的基本约束，再理解模型、知识检索和自主执行。编号表示推荐阅读顺序。当前各章是有实际练习和验收要求的导读，不是已完成的代码教程。

## 00 起点

- [能力迁移与系统边界](00-foundations/01-engineering-map.md)

## 01 工程基础

- [稳定性：超时、取消与并发](01-engineering/01-reliability.md)
- [异常处理：从 HTTP 成功到任务成功](01-engineering/02-error-handling.md)
- [缓存与降级：速度之外的正确性](01-engineering/03-cache-and-fallback.md)
- [性能：从首屏到任务完成](01-engineering/04-performance.md)
- [成本：每个成功任务花了多少](01-engineering/05-cost.md)
- [可观测性：请求轨迹与质量反馈](01-engineering/06-observability.md)

## 02 LLM 工程

- [LLM 调用契约与结构化输出](02-llm/01-call-contract.md)
- [上下文与 Prompt：管理输入依赖](02-llm/02-context.md)
- [评测：把不确定输出纳入回归](02-llm/03-evaluation.md)

## 03 RAG 工程

- [知识处理：从文档到可检索单元](03-rag/01-knowledge-pipeline.md)
- [检索：关键词、语义与混合召回](03-rag/02-retrieval.md)
- [回答：证据、引用与拒答](03-rag/03-grounded-answer.md)

## 04 Agent 工程

- [工具契约：把函数调用变成受控执行](04-agent/01-tool-contract.md)
- [执行循环：状态机、预算与恢复](04-agent/02-execution-loop.md)
- [工作流还是 Agent：把自由度放在需要的地方](04-agent/03-workflow-or-agent.md)

## 05 综合实践

- [综合实践：组件文档助手](05-project/01-component-assistant.md)

## 学习产出

每章留下一个失败样例、一项可测量指标和一条设计决策。最终产出可运行应用、评测集、运行说明和可复现的对比报告。不要以读完术语或单次演示成功作为完成标准。

## 推荐推进方式

先完成只读问答的纵向切片，再逐步补充失败注入、检索、质量评测与观测。Agent 阶段允许得出“固定工作流更合适”的结论。

[返回项目首页](https://github.com/CrayonPig/frontend-to-agent)

[站点开发与部署](contributing.md)
