# 版本、来源与核验范围

核验日期：2026-10-26。版本号描述本教程选择的适用范围，不等于“永远最新”或生产环境推荐。正文里原创 Atlas 产品版本与以下真实工具版本无关。实际运行、类型核对和仅阅读官方文档是不同证据。

| 范围 | 采用或核对的版本 | 一手来源 | 验证边界 |
| --- | --- | --- | --- |
| 本地运行 | 要求 Node.js 22+；本轮实测 v24.19.0 | [Node 官方测试运行器文档源码](https://github.com/nodejs/node/blob/v22.x/doc/api/test.md) | 内置测试实际执行；未声称额外在 Node 22 跑过 |
| 文档站 | VitePress 1.6.4（沿用 lockfile） | [1.6.4 官方部署文档](https://vuejs.github.io/vitepress/v1/guide/deploy) | 本地构建；不升级站点依赖或修改部署设置 |
| Langfuse JS/TS | tracing/otel/client 6.0.2；OTel sdk-node 0.208.0、api 1.9.0 | [SDK 概览](https://langfuse.com/docs/observability/sdk/overview)、[官方 SDK 仓库](https://github.com/langfuse/langfuse-js) | 精确兼容性与类型核验见 03–12 记录；未运行真实上报 |
| Langfuse Prompt | 同一 JS/TS v6 包系列 | [版本与标签](https://langfuse.com/docs/prompt-management/features/prompt-version-control)、[关联 trace](https://langfuse.com/docs/prompt-management/features/link-to-traces) | 本地注册表实际测试；外部 Prompt 服务未调用 |
| Elasticsearch | 可选 8.19.23，使用 8.19 REST 文档 | [Docker 安装](https://www.elastic.co/guide/en/elasticsearch/reference/8.19/docker.html)、[bool 查询](https://www.elastic.co/guide/en/elasticsearch/reference/8.19/query-dsl-bool-query.html)、[别名操作](https://www.elastic.co/guide/en/elasticsearch/reference/8.19/indices-aliases.html) | REST 示例与官方语法核对；未启动实例 |
| MCP | 2026-07-28 协议文档 | [架构](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture)、[版本规则](https://modelcontextprotocol.io/docs/2026-07-28/learn/versioning) | 职责与协议概念核验；未选定或运行客户端 SDK |
| Skills | 核验当日公开格式规范 | [Agent Skills 规范](https://agentskills.io/specification)、[Anthropic 原始介绍](https://www.anthropic.com/research/equipping-agents-for-the-real-world-with-agent-skills) | 原创教学 Skill 及资源；不自动安装或执行 |
| 工作流/Agent | 概念，不绑定框架版本 | [Anthropic Building effective agents](https://www.anthropic.com/research/building-effective-agents) | 使用其职责区分，不照搬旧 SDK 示例 |
| 异步观测 | 兼容上述 OTel 依赖的概念与示例 | [OpenTelemetry JS 上下文传播](https://opentelemetry.io/docs/languages/js/propagation/) | 本地父子记录已测，真实跨服务传播未测 |

## 分主题核验细节

- [03–12 调用与观测](03-12-review.md)：版本选择、类型检查、生命周期与未上报范围。
- [13–21 知识与安全](13-21-review.md)：检索、过滤、别名与 RAG 机制来源。
- [22–30 工具与 Agent](22-30-review.md)：动作、确认、恢复与对比的自审。
- [31–40 能力与运营](31-40-review.md)：协议、Skill、Prompt 与版本治理核验。

## 不由来源替我们证明的事情

官方文档证明某项 API 或协议在指定范围的定义，不证明 Atlas 助手的业务效果。示例里的合成成本单位不是供应商费用，字符预算不是 token 实测，向量算例不是真实 embedding 检索成绩，工作流与脚本循环比较也不是模型能力排名。所有质量判断应回到题目、输入资料、候选结果和具体规则。

真实集成时重新核对官方版本和依赖范围，保存锁文件及环境条件，再按正文步骤执行自检。不要因为本页记录过一个日期，就忽略之后 API、兼容性或服务行为的变化。

[返回学习目录](../README.md) · [覆盖矩阵](coverage.md)
