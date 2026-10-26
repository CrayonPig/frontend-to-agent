# 03–12 篇内容与接口核验记录

核对日期：2026-10-26。本文是内容与接口核验记录，不是新增课程编号。03–12 已写成正文，不是待写提纲。本文记录的是本地文档与编译验证，外部模型、Langfuse 平台上报和浏览器交互不在本次实测范围。

## 覆盖与边界

| 篇 | 主要产出 | 示例性质与验证边界 |
| --- | --- | --- |
| 03 | 模型请求生命周期、训练/上下文/应用存储区分 | 请求包为平台无关示意；没有真实 token 或模型质量测量 |
| 04 | 浏览器、服务端、适配层与可信身份边界 | 对接仓库本地 mock 命令；适配器类型和流程为示意；无真实认证 |
| 05 | 六分支输出契约与解析/结构/业务三层检查 | TypeScript 结构示意；不声称引用 ID 校验能证明事实 |
| 06 | 草稿与最终结果、请求归属、取消与终态 | 本地 HTTP 测试与待做浏览器时序明确分开；不称为供应商流 |
| 07 | 14 题评测、8/6 开发/检查划分、候选记录与评分 | 规则报告不冒充模型准确率，公开检查题不冒充盲测 |
| 08 | 执行错误与业务结果、可行动恢复表 | 响应封套与故障注入为设计示意 |
| 09 | 总预算、有界重试、并发与队列边界 | 伪代码及预期故障表，教学数值不是服务参数建议 |
| 10 | trace 树、session/task/request/attempt 区分 | 业务命名约定；不记录私密推理，trace 不作为恢复状态库 |
| 11 | 固定 SDK 组合、完整合成上报程序、生命周期与自检 | npm 安装/依赖树/TS 编译已验证；没有密钥、没有运行上报 |
| 12 | 手动/自动职责、传播、去重、导出边界 | Langfuse 局部片段非独立程序；本地白名单与平台导出分开 |

原始事实沿用起点：C-B14 使用 loading，C-B20 使用 pending，两者都另需 disabled；C-T20 不支持对未说明能力作肯定或否定结论；X-T20 只在 Q09，冲突卡仅在 Q14 替换 C-T20；T-B20 不进入 reader-a 可见资料或导出。六种结果类别与第 01/02 篇一致。

## 官方来源及核验内容

- [Hugging Face 文本生成](https://huggingface.co/docs/transformers/main/en/llm_tutorial)：token 编码与逐步生成概念；不使用其 Python 安装示例。
- [Node.js AbortController](https://nodejs.org/api/globals.html#class-abortcontroller)：取消信号机制，不解释为远端业务撤销。
- [Langfuse SDK 概览](https://langfuse.com/docs/observability/sdk/overview)：JS/TS v6、Node >=22、自托管 >=4.59.0、NodeSDK 初始化与 shutdown。
- [Langfuse 埋点](https://langfuse.com/docs/observability/sdk/instrumentation)：startActiveObservation、generation、自动/手动组合。
- [Session](https://langfuse.com/docs/observability/features/sessions)、[Trace ID](https://langfuse.com/docs/observability/features/trace-ids-and-distributed-tracing)：分组与 ID 范围。
- [环境](https://langfuse.com/docs/observability/features/environments)：LANGFUSE_TRACING_ENVIRONMENT。
- [Masking](https://langfuse.com/docs/observability/features/masking)：导出前遮蔽与多导出路径；另对安装包 6.0.2 的类型注释核对 mask 不覆盖 propagateAttributes trace metadata。
- [Docker Compose](https://langfuse.com/self-hosting/deployment/docker-compose)：只提供可选准备链接，未执行部署。
- [OTel JS propagation](https://opentelemetry.io/docs/languages/js/propagation/)：inject/extract 与活动上下文，非身份授权。
- [tracing 6.0.2 发布元数据](https://registry.npmjs.org/@langfuse/tracing/6.0.2)、[otel 6.0.2 发布元数据](https://registry.npmjs.org/@langfuse/otel/6.0.2)、[sdk-node 0.208.0 发布元数据](https://registry.npmjs.org/@opentelemetry/sdk-node/0.208.0)：实际依赖声明与 Node 引擎要求。

这些是当前读取到的官方资料，不代表服务永远维持相同接口。固定包并不替代后续安全升级与兼容验证。

## 已执行的独立 SDK 检查

在仓库之外的临时目录安装第 11 篇所列固定版本，未添加主项目依赖，未创建账号或使用凭证。首次仅固定顶层包时，开放的 peer 范围拉取了不兼容的新 OTel 包并出现 override 警告；随后显式固定 core、sdk-trace-base、otlp-exporter-base 和 exporter-trace-otlp-http，最终 `npm ls --all` 退出码 0。存在上游弃用提示，正文已披露，不能称此组合为最新版推荐栈。

把第 11 篇完整 `demo.mts` 保存到该隔离目录并执行：

```bash
./node_modules/.bin/tsc demo.mts --module nodenext --target es2022 --strict --outDir build --skipLibCheck false
npm ls --all
```

两条均退出码 0。编译器为 TypeScript 5.9.3，执行环境 Node 24.19.0；未在 Node 22 进程上运行程序，Node 22 最低要求来自官方包声明。程序包含缺少配置的前置拒绝、NodeSDK 初始化、mock generation、forceFlush 与 finally shutdown。没有执行生成后的上报程序，因此无 trace 接收成功、平台截图、真实 token 或费用证据。

各文章本地相对链接检查、单一 H1 检查通过；`git diff --check` 通过。最终 VitePress 构建、跨章导航与全项目结果见[整合验证记录](progress.md)。

[返回学习目录](../README.md)
