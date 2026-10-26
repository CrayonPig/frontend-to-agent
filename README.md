# Frontend to Agent

> 用前端工程思维理解 AI Engineering。

面向有 JavaScript / TypeScript、组件、接口调用和线上项目经验的前端工程师，从已有的工程经验出发，逐步理解 LLM、RAG 和 Agent，并把它们做成可验证、可维护的应用。

你已经处理过请求超时、错误兜底、缓存失效、性能优化和线上排障。这些经验在 AI 应用里仍然有用。新的挑战是：模型输出存在不确定性，检索结果不一定相关，工具调用可能产生真实副作用。我们需要在熟悉的工程方法上补上质量评测、上下文管理和执行边界。

## 这份指南怎么学

从[任务清单](docs/00-foundations/02-assistant-task-list.md)开始，沿同一个 Atlas 助手逐步引入调用、评测、观测、检索、工具和按需 Agent。[42 篇学习目录](docs/README.md)按 10 个部分组织，每一篇有独立的问题和产出；最后两篇整合已有系统，不重新启动一个项目。

先运行无需密钥的[合成示例](examples/atlas/README.md)，检查任务与边界；再按需求选择真实模型、Elasticsearch、Langfuse 或 MCP 接入。代码与资料全部原创合成，不读取真实用户或公司数据。

## 观测实践如何贯穿

[详细大纲与观测路线](docs/outline.md)把42篇的操作、观察结果和验收连起来。观测从10的记录关系进入11的模型HTTP调用与Langfuse SDK上报，12补业务步骤，再沿19的分层评测、27–28的执行与恢复、30的故障演练，到36/38的延迟与成本、39的Prompt版本比较和40的发布回退。

基础合成程序与独立的[TypeScript观测实践工程](examples/atlas-observability/README.md)分别运行。后者提供真实适配路径与本地HTTP测试；SDK序列化测试通过不代表外部平台已收到，也不代表真实模型质量通过。精确证据以[验证记录](docs/reviews/progress.md)为准。

## 从熟悉的问题开始

| 前端工程经验 | AI Engineering 中的对应问题 | 新增边界 |
| --- | --- | --- |
| 请求封装、取消与超时 | 模型调用、流式输出、工具调用 | 超时不代表远端没有执行 |
| 错误处理、状态机 | 结构错误、拒答、循环失败 | 请求成功不代表答案正确 |
| 缓存、兜底 | 检索缓存、答案缓存、模型降级 | 命中不代表权限与事实仍有效 |
| 首屏、并发、性能预算 | 首个 token、检索耗时、任务完成耗时 | 输出更快不代表完成更快 |
| 包体积与资源预算 | token、模型调用与工具成本 | 要看每个成功任务的成本 |
| 埋点、错误监控 | trace、检索轨迹、质量评测 | 遥测数据可能包含敏感内容 |
| 组件契约、类型系统 | 结构化输出、工具 schema | 类型检查不能验证业务真实性 |

## 学习路线

1. 00 起点：定义任务与人工判定。
2. 01 第一次调用：上下文、服务端接入、契约与流式状态。
3. 02 可检验的系统：评测、错误、预算与观测。
4. 03 知识获取：文档单元、关键词、语义与混合检索。
5. 04 有依据的回答：引用、分层评测、更新与安全。
6. 05 受控工具：实时只读查询、固定流程和沙箱写入。
7. 06 按需 Agent：有限决策、预算、恢复、对比和复盘。
8. 07 长任务治理：上下文、记忆、Skill、MCP 与多 Agent 取舍。
9. 08 系统运营：延迟、缓存、成本、Prompt 与发布治理。
10. 09 整合交付：[架构](docs/09-integration/41-architecture.md)与[可复现验收](docs/09-integration/42-handoff.md)。

## 仓库范围与验证

全系列正文与默认合成程序分别验收，逐篇状态见[覆盖矩阵](docs/reviews/coverage.md)，实际命令与阶段结果见[验证记录](docs/reviews/progress.md)。旧导读保留原 URL，并提供[迁移入口](docs/reviews/migration.md)。

合成程序使用确定性规则 mock，支持原始 Q01–Q14、授权检索、结果校验、修订与删除、沙箱确认与幂等、受限循环、检查点和本地观测。它的通过率不是模型质量评估，也不证明真实成本或延迟优势。真实模型、Elasticsearch、Langfuse 上报、MCP 服务和生产身份/事务系统属于可选路径，未由本地测试证明。

使用 Node.js 22+，在仓库根目录运行：

```bash
npm ci
npm run docs:check
npm test
npm run evaluate
npm run docs:build
npm run demo
```

最后一条启动回环地址上的演示页面 `http://127.0.0.1:8787`。它使用固定合成身份，不是可公网部署的认证系统。评测报告写入 `examples/atlas/reports/baseline.json`，包含候选答案、规则判定和运行版本。新增或替换外部适配器后，必须重新回归。

## 内容约定

每篇内容从具体场景出发，说明前端类比、类比失效的地方、实现思路、失败模式和验收方式。避免术语堆砌和框架目录式学习。

参与编写前请阅读 [AGENTS.md](AGENTS.md)。新增内容应同步更新[学习目录](docs/README.md)，保证链接可访问。

## VitePress 文档站

文档站地址：https://CrayonPig.github.io/frontend-to-agent/

使用 Node.js 22+：

```bash
npm ci
npm run docs:dev
npm run docs:build
npm run docs:preview
```

站点配置在 `docs/.vitepress/config.mts`。沿用现有 GitHub Pages 工作流：推送 main 自动发布，PR 仅构建。详见[站点开发与部署](docs/contributing.md)。
