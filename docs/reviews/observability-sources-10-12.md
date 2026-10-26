# 第 10–12 篇：观测实践核验记录

核对日期：**2026-10-26**。本页对应新增的 `examples/atlas-observability` 实操包，以及重写后的 10、11、12 篇；此前 `03-12-review.md` 中“仅在临时目录编译、未执行上报程序”的记录是旧稿验证范围，不能代表本次修订。此次已使用真实 Langfuse SDK 向本地 HTTP 采集器导出，仍未连接真实 Langfuse 项目或付费模型。

## 这次具体落实了什么

| 正文 | 与可运行包的对应关系 | 验证证据 |
| --- | --- | --- |
| 10 Trace、Observation、Session | `src/runtime.ts` 的任务范围、传播字段、generation、业务 ID；`extractSpans` 保留实际 trace/span/parent 关系 | `reports/all-spans.json` 与 `demo-report.json` 可按 trace ID 互查 |
| 11 接入 Langfuse | 独立锁文件安装、真实 SDK 初始化、HTTP 模型适配器、Prompt 获取、flush/shutdown；另给平台/Docker/密钥/外部调用完整步骤 | `reports/tests.txt`、`http-contract.json`、`all-otlp.json`；Docker及外部步骤明确未执行 |
| 12 自动与手动埋点 | 授权、候选取得、证据选择、合成工具、Prompt、模型、校验七个实际子动作；并发、出口脱敏、采样 | 本地集成测试断言 2 条并发完整 trace 共 16 项、越权路径 4 项、脱敏和 rate=0 |

本地检索阶段使用固定授权 fixture，不是 ES/向量检索；选择阶段检查范围，不是 reranker；工具使用合成构建回执，不访问真实构建系统。HTTP 模型替身按模板产生预定候选，不代表真实模型改善。三个限制都已在正文指出。

## 官方一手资料与核对范围

| 来源 | 实际核对内容 |
| --- | --- |
| [SDK 概览与兼容表](https://langfuse.com/docs/observability/sdk/overview) | JS/TS v6、Node 22+、服务端最低 4.59.0、NodeSDK 与 shutdown 接入路径 |
| [官方 instrumentation](https://langfuse.com/docs/observability/sdk/instrumentation) | startActiveObservation、asType、活动上下文、手动/自动可组合；组合不等于自动去重 |
| [Trace ID 与分布式关联](https://langfuse.com/docs/observability/features/trace-ids-and-distributed-tracing) | trace/span 标识格式、与业务 ID 的区别 |
| [Sessions](https://langfuse.com/docs/observability/features/sessions) | session 关联多个 trace，propagateAttributes 用途 |
| [Environments](https://langfuse.com/docs/observability/features/environments) | 环境字段与 LANGFUSE_TRACING_ENVIRONMENT；环境不是授权隔离 |
| [Masking](https://langfuse.com/docs/observability/features/masking) | 出口前遮蔽、多路径检查；同时核对安装包 6.0.2 类型声明中的 trace metadata 例外 |
| [Sampling](https://langfuse.com/docs/observability/features/sampling) | JS 使用 OTel sampler，根 trace 采样与子项关系 |
| [Access Control](https://langfuse.com/docs/administration/rbac) | 项目、组织、用户角色与项目 API key 区别；查看与导出不能靠环境标签隔离 |
| [Docker Compose 部署](https://langfuse.com/self-hosting/deployment/docker-compose) | 依赖组件、无默认管理员、初始化、端口、日志与单机限制 |
| [v4.59.0 官方 compose 文件](https://github.com/langfuse/langfuse/blob/v4.59.0/docker-compose.yml) | 实际读取原文件 HTTP 200；CHANGEME变量、口令关联、镜像仍为浮动 :4，checkout tag 不等于镜像固定 |
| [OTel JavaScript propagation](https://opentelemetry.io/docs/languages/js/propagation/) | 进程内上下文与跨进程注入/提取区分；不视为身份授权 |
| [Chat Completions 官方接口](https://developers.openai.com/api/reference/resources/chat) | HTTP adapter 的 messages、model、max_completion_tokens、JSON输出请求、choices/finish_reason/usage；不保证所有兼容服务支持 |
| [Langfuse tracing 发布元数据](https://registry.npmjs.org/@langfuse/tracing/6.0.2) / [otel 发布元数据](https://registry.npmjs.org/@langfuse/otel/6.0.2) / [OTel sdk-node 发布元数据](https://registry.npmjs.org/@opentelemetry/sdk-node/0.208.0) | 实际版本、Node 引擎和 peer 依赖；独立 package-lock 固定传递依赖 |

固定组合为 Langfuse tracing/otel/client 6.0.2，OTel api 1.9.0，core/sdk-trace-base 2.2.0，sdk-node/otlp-exporter-base/exporter-trace-otlp-http 0.208.0，TypeScript 5.9.3。保留上游弃用提示，不声称这是长期推荐的最新组合。

## 本次实际观测到的结果

读取本次保存的 `reports/tests.txt`：18 tests、18 pass、0 fail。测试使用真实 `LangfuseClient` 完成 Prompt HTTP 创建、获取与标签 PATCH；真实 `LangfuseSpanProcessor` 序列化并经 HTTP 送到采集器。原始 OTLP 正文及展开的 spans 已保存，不只检查一个内存日志数组。

`demo-report.json` 的运行模式为 `local-http`。版本 1 产生的合成坏候选失败，版本 2 合格；两者 usage 与 cost 都是 null，未用字符串长度估算真实 token。`all-spans.json` 总计 36 项：正常比较两条各 8 项、fallback 8 项、证据越权提前停止 4 项、另一次回归 8 项。该数量来自本次固定演练，不是模型性能指标。

实际采集的一条 generation 包含以下属性：

```text
langfuse.observation.type = generation
langfuse.observation.prompt.name = atlas-answer
langfuse.observation.prompt.version = 2
langfuse.observation.model.name = atlas-http-mock
session.id = session-a30-demo
user.id = reader-a
langfuse.trace.metadata.taskId = JSON 编码的 A30-compare
langfuse.observation.metadata.diagnostic = JSON 编码的 [REDACTED]
langfuse.observation.metadata.usageKnown = false
langfuse.observation.metadata.costKnown = false
```

canary 原值、合成 secret key 与隐藏文档 ID 未出现在采集正文。这个断言只覆盖本例字段与路径，不能外推为通用 DLP。传播的 trace metadata 由应用使用合成白名单约束，不依赖 generation 的 mask 补救。

## 尚未执行、不能声称通过的项目

- Docker CLI 28.4.0、Compose v2.40.3 和 daemon 可用，但没有拉取/启动 Langfuse 镜像，没有创建用户、组织、项目或真实密钥。
- 没有使用真实 Langfuse 项目进行持久化、UI 筛选、角色权限或删除验证；第 11 篇列出具体操作与预期，不写成已成功截图。
- 没有访问付费模型。HTTP adapter 的本地契约测试不证明任意服务、模型、配置都兼容。
- 没有实现完整搜索引擎、语义重排或跨服务队列；没有把尚未发生的动作补成空 span。
- 当前评分只针对公开合成 A30 的有限断言。它可以抓住设计的坏候选，不是通用语言事实裁判或真实模型质量基准。

[返回学习目录](../README.md) · [观测学习支线与完整大纲](../outline.md)


追加边界核验：模型HTTP错误正文、响应头和非法JSON在观测回调抛出前转换为稳定错误码，异常stack也只保留该码；Prompt读取异常同样归一。实际OTLP的attributes/events/status整体检查不含哨兵、密钥值、隐藏来源或执行器路径。选择器Prompt状态仅回填已授权工具结果；答案严格限制字段，不保存额外reasoning。新Agent测试和报告详见示例verification记录。
