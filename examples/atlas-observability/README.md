# Atlas 真实 SDK 观测与 Prompt 演练

这是独立、可选的 TypeScript 包。它将 **真实 Langfuse 6.0.2 SDK** 接入同一条 Atlas 合成任务，并通过本地 HTTP 替身验证 Prompt API、模型请求及 OTLP 序列化。默认不会请求外部模型或平台，不需要账号、真实密钥、Docker 或付费服务。

任务固定为 `A30-unsupported-capability`：“AtlasTable 2.0 有 virtual 参数吗？演示构建通过了吗？”C-T20@r1 未说明 virtual，构建夹具 build-demo-20 为 succeeded。两者不能互相推导。基础包的 Q01–Q14 仍由 `../atlas/evaluate.mjs` 验证；本包只对 A30 做完整的 SDK/HTTP 纵向演练，不声称完成 14 题模型评测。

## 先跑完全本地的路径

从仓库根目录进入本包，使用 Node.js 22+：

```bash
cd examples/atlas-observability
npm ci
npm run build
npm test
npm run demo -- all
```

`all` 会自动开启仅监听回环地址的临时 HTTP 服务，使用 SDK 创建两版 Prompt（已存在则核对内容，不覆盖），并发比较版本 1/2，演示 SDK fallback、拒绝越权证据、重放失败评分及版本 2 回归。任务完成后等待 `forceFlush()`，保存实际收到的 OTLP 请求，然后 `shutdown()` 并关闭本地服务。**不会自动移动 production 标签。**

本地模型替身故意根据模板内容返回预设结果：版本 1 返回“构建成功所以支持 virtual”的错误答案，版本 2 保留未知。对比结果能验证应用、SDK、记录和评分路径，不能证明真实模型使用新 Prompt 就会改善。模型 HTTP 返回没有 usage，因此报告中用量、费用均为 `null`。

固定依赖包含 `@langfuse/client/tracing/otel@6.0.2`、OpenTelemetry API 1.9.0、core/sdk-trace-base 2.2.0、sdk-node/OTLP HTTP exporter/otlp-exporter-base 0.208.0、TypeScript 5.9.3。依赖和锁文件仅在本目录，不改变根文档站依赖。安装时已有 OTel 旧包弃用提示；本组合按类型声明及实际本地 HTTP 测试核验，不把弃用等于漏洞，也不推荐永久不升级。

## 每个命令实际做什么

以下命令都在本包目录运行；除 `demo`/`test` 外，先执行 `npm run build`。

```bash
npm run seed-prompts
npm run run -- --prompt-version 2
npm run run -- --label production
npm run compare
npm run failure
npm run replay
npm run run -- --prompt-version 999 --fallback
npm run promote -- --version 2 --confirm
npm run rollback -- --version 1 --confirm
```

| 命令 | 行为与产物 |
| --- | --- |
| `seed-prompts` | 通过真实 `LangfuseClient.prompt.create/get` 创建或核对 `atlas-answer` v1、v2。v1 初始 production，v2 初始 staging；后续重复执行不重置现有标签 |
| `run` | 指定版本或标签，真实 SDK get/compile，HTTP 模型调用，再做独立质量检查；`reports/run.json` |
| `compare` | 同一 A30、相同资料及模型配置，两版并发运行；`reports/compare.json`，不推广 |
| `failure` | v1 故意产生错误；`reports/failure.json` 记录 `quality.pass=false`、`qualityStatus=failed`、`resultKind=null` |
| `replay` | 读取 failure.json，核对 fixture/rule 版本，重新评分保存的候选（该部分不调用模型）；再独立执行 v2 回归；`reports/replay.json` |
| `run ... --fallback` | 对不存在的 999 使用 SDK 的 fallback 选项；明确标为 `local-fallback/local-v2`，不假称远端 v2 |
| `promote` | 必须 `--confirm`，读取 compare.json 的候选通过结果，核对资料/规则版本、Prompt 内容及配置 hash，使用 SDK update 移动 production，再 fresh get 验证 |
| `rollback` | 必须 `--confirm`，读取已存在版本后移动标签；报告 `qualityNotApproved=true`。这是显式恢复旧配置，不代表旧版质量合格；v1 仍不能通过当前质量门槛 |

默认本地服务状态保存在 `reports/local-state.json`，因此 seed → run → compare → promote 可跨进程执行。它只包含合成 Prompt，没有凭证。这个文件模拟平台持久化，不是真实 Langfuse 数据库；不能用它推断平台的事务、安全或缓存行为。

命令正常完成时退出码为 0，即使本次故障注入的质量评分失败；评分失败是 `failure` 的预期产物。网络/配置/版本/推广门槛失败退出码为 1。不要用进程退出码替代 `quality.pass`。`npm test` 明确断言错误答案必须失败、修复答案必须通过。

## 看真实 SDK 发出的内容

每个命令保存本次实际 HTTP 采集内容为 `reports/<command>-otlp.json` 和提取后的 `reports/<command>-spans.json`；`otlp.json`、`spans.json` 是最后一次命令的便捷副本，后续运行会覆盖。`all` 对应 `all-otlp.json`、`all-spans.json`；根报告是 `demo-report.json`。检查失败运行可执行：

```bash
node --input-type=module <<'JS'
import fs from 'node:fs'
const run = JSON.parse(fs.readFileSync('reports/failure.json', 'utf8'))
const spans = JSON.parse(fs.readFileSync('reports/failure-spans.json', 'utf8'))
console.log({ traceId: run.traceId, prompt: run.prompt, quality: run.quality })
console.table(spans.filter(s => s.traceId === run.traceId).map(s => ({
  name: s.name, spanId: s.spanId, parentSpanId: s.parentSpanId, durationMs: s.durationMs
})))
JS
```

一次正常 A30 使用 8 个实际 SDK observation：

```text
assistant.task
├─ authorize
├─ retrieve.docs
├─ select.evidence
├─ tool.build_status    (asType: tool)
├─ prompt.resolve
├─ model.answer         (asType: generation)
└─ answer.validate
```

每个业务动作在 `startActiveObservation` 的异步活动范围中执行。模型 generation 确实包围一次 `fetch` HTTP 调用，不再只是手工填一个虚构 generation。它的服务端仍是本地脚本替身，不能称为真实模型推理。测试检查两次并发执行 traceId 不同，7 个子项的 parentSpanId 分别属于自己的根节点，没有跨请求串线。

`generation.update({ prompt })` 传入真实 SDK Prompt 对象，导出字段包含 `langfuse.observation.prompt.name/version`。fallback 没有该远端关联，另记 provenance。模型配置必须先校验；`config.model` 与 `maxCompletionTokens` 实际进入 HTTP 请求，外部模式还要求 config.model 等于运行环境明确允许的 MODEL_NAME，防止远端模板自行切换模型。SDK 缓存测试使用两个客户端，证明另一个客户端的标签缓存可能滞后，fresh get 才读取新标签。

生成成功与质量成功分开：v1 的 model.answer 技术调用成功，answer.validate 中 `pass=false`；root 记录质量失败，不把它塞进原教程六种有效 TaskResult。报告不是已向平台提交的 Score 对象。本包没有调用 Score API；评分规则及结果在报告与校验 observation 中明确保存。

## 脱敏、采样与记录范围

业务代码只把合成题号、已授权来源 ID/修订、构建结果和候选答案送入观测。故意插入的隐藏 T-B20 在 `select.evidence` 被拒绝，既不调用模型，也不将隐藏 ID/原文放进遥测。`propagateAttributes` 只传播合成 user/session/task/run/attempt 和资料版本；它们不是权限票据。

真实 `LangfuseSpanProcessor.mask` 处理导出前的 input/output/observation metadata。测试将 `SYNTHETIC_SECRET_CANARY` 放入 observation metadata，然后检查 **HTTP 接收的完整序列化 payload** 已替换为 `[REDACTED]`，不是仅测试一个孤立字符串函数。敏感字段名同样遮蔽。这个规则不是通用 PII 检测器；传播的 trace metadata 不在同一 mask 范围，代码采用白名单，不把凭证放进去。SDK 原始错误日志关闭，CLI 只报告失败，不持久化请求认证头。NodeSDK 关闭自动资源检测，避免把主机/进程/命令行路径当遥测资源一起导出；这与 observation mask 是不同边界。

```bash
npm run run -- --prompt-version 2 --sample-rate 0
```

采样在 OTel 根级 `TraceIdRatioBasedSampler` 和 `ParentBasedSampler` 组合处执行。测试采样 0 时没有 HTTP 导出 span，而业务结果仍存在；正常演练用 1，便于完整检查。部分采样下不能用保留下来的 trace 简单估计总体成功率。这里不提供跨服务传播器、自动埋点或队列消费者；没有自动与手动 generation 重复的问题，也没有模拟真实平台访问控制。

## 再按需连接已有 Langfuse 项目

这条路径**未实际执行**。需要读者自己已有、获准使用的 Langfuse 项目或官方自托管服务（v6 SDK 要求服务端至少 4.59.0），不要求本教程替你创建账号或购买服务。复制 `.env.example` 为已被忽略的 `.env`，仅在本机填值。

先只接真实 Langfuse，模型继续本地 HTTP，避免平台验证同时引入模型费用：

```bash
node --env-file=.env build/src/cli.js seed-prompts --external --mock-model --confirm
node --env-file=.env build/src/cli.js run --external --mock-model --prompt-version 2
```

设置 `LANGFUSE_BASE_URL`、`LANGFUSE_PUBLIC_KEY`、`LANGFUSE_SECRET_KEY` 和可选 `LANGFUSE_TRACING_ENVIRONMENT=atlas-demo`。external 模式不使用本地 Prompt 数据库或本地 OTLP 采集器；需在该项目中按实际 traceId 核对链路、标签与版本。初始化一次、刷新、finally shutdown 的路径相同。平台 UI 可见性、持久化、权限/保留/删除及 Docker 部署没有被本地测试替代。

要明确选择外部模型时，再配置 `MODEL_BASE_URL`（包含 `/v1` 等基础路径）、`MODEL_NAME`、`MODEL_API_KEY`，执行不带 `--mock-model` 的 `--external`。这会向用户明确配置的外部服务发送本篇合成资料，并可能计费；本次开发没有执行。Prompt config.model 必须匹配 MODEL_NAME，首次创建时 seed 使用这个名字。已有同名版本内容/配置不一致时会拒绝覆盖；不要为绕过校验偷偷重写已发布版本，应使用独立演示项目或明确演进版本后再运行。

```bash
# 可选外部操作；需要已有授权与配置，本仓库未执行：
node --env-file=.env build/src/cli.js seed-prompts --external --confirm
node --env-file=.env build/src/cli.js run --external --prompt-version 2
```

HTTP 适配器使用 Chat Completions 的 `messages`、`model`、`max_completion_tokens`、`response_format: json_object`，检查结束原因和拒答，再解析应用结构。目标服务/模型必须支持这些字段；“OpenAI-compatible”不是兼容性保证。它不支持流式、工具调用协议、多模态或所有供应商；固定工作流的只读构建工具由应用执行；Agent 路径由选择器提出受限动作，执行端独立校验。外部地址不提供默认值，不跟随重定向；本地模式拒绝非回环端点。

## 已验证事实与边界

本次实际环境为 Node.js v24.19.0。`npm test` **18 项测试通过**（含父级集成测试与子测试），`tsc` 通过，实际 SDK → 本地 HTTP Prompt API/Chat Completions/OTLP 完整链路通过。`reports/tests.txt` 保留输出；其他 reports 文件由真实本地命令生成，运行标识和耗时每次不同。

这不是质量 benchmark：只有一条合成组合任务，模型行为人为固定，费用和用量未知。没有调用付费模型、创建外部账号、设置真实密钥，或验证真实 Langfuse 服务的 UI/部署。`replay` 重评分保存结果并另起回归，不重放私密推理，也不恢复旧执行进程。报告文件是本地教学记录，不是防篡改发布审批系统；生产推广需要可信报告存储、审批权限和完整回归集。

官方核验日期 **2026-10-26**：

- [Langfuse SDK 概览](https://langfuse.com/docs/observability/sdk/overview)、[埋点](https://langfuse.com/docs/observability/sdk/instrumentation)、[高级功能与 mask](https://langfuse.com/docs/observability/sdk/advanced-features)。
- [Prompt 创建/读取/编译](https://langfuse.com/docs/prompt-management/get-started)、[版本标签](https://langfuse.com/docs/prompt-management/features/prompt-version-control)、[关联 trace](https://langfuse.com/docs/prompt-management/features/link-to-traces)。
- [OpenAI Chat Completions API](https://developers.openai.com/api/reference/resources/chat)：仅核对请求/响应契约，未实际请求该服务。
- SDK 6.0.2 发布类型声明及实现：`prompt.create/get/update`、`fallback`、`cacheTtlSeconds`、OTLP 导出路径 `/api/public/otel/v1/traces`；这些声明由本包精确锁文件安装，并经本地 HTTP 测试核对。

## 受限 Agent：重复动作耗尽预算，再修正选择策略

```bash
npm run agent-failure
npm run agent-compare
npm run agent-run -- --http-selector
```

这些命令不依赖 seed-prompts。`src/agent.ts` 维护本次执行的观察状态，每一步重新选择 `read_docs`、`build_status` 或 `finish`。默认 `repeat-build` 策略反复查询构建；默认工具预算 2，第三次提议在执行前被拦截。报告 `agent-failure.json` 得到 `steps: 3`、`toolCalls: 2`、`stopReason: tool_budget`，不是成功答案。

`agent-compare.json` 的 `runs` 使用相同合成 A30、同一 taskId、不同 attempt。修正的 `evidence-first` 根据当前缺失的观察先读取授权文档，再查询构建，最后提交答案；3 次选择、2 次工具执行，`completed` 且 `quality.pass: true`。这不是按固定步骤编号推进：工具结果进入状态，选择器依据状态决定下一步。默认选择器是确定性的教学脚本，不能据此宣称真实模型自主决策质量提升。

`--http-selector` 把该状态与动作契约经真实 Chat Completions HTTP 适配器交给选择器，本地服务模拟选择结果。该路径的 `agent.choose` 是 SDK generation；默认脚本路径是 span，不能把脚本冒充模型。已有外部授权与配置后可执行 `node --env-file=.env build/src/cli.js agent-run --external --http-selector`，本次没有执行外部路径。选择器输出不能改变身份或预算；工具参数仅允许指定 AtlasTable 2.0，finish 必须具有两个工具的证据并通过有界评分。JSON 多余字段（包括 reasoning）拒绝，未进入私密推理采集。

真实树为 `agent.task → agent.step → agent.choose / tool.read_docs / tool.build_status / answer.validate`；`task.stop` 位于根下。每步 input 保留已消耗步数、工具次数、合成成本单位和绝对 deadline。上限分别为 4 步、2 次工具、4 个合成单位和 5 秒；每次选择预留 1 单位，执行前再次检查期限。费用单位仅为预算机制演练，实际 cost/usage 报告仍为 null，绝不能当成货币价格或真实费用上限。可以调用导出函数设置更小上限，测试验证 step_budget、cost_budget、deadline 与 tool_budget 终止。

`agent-failure-spans.json` 10 条，`agent-compare-spans.json` 21 条，HTTP `agent-run-spans.json` 11 条；各自原始 SDK payload 为同名前缀 `-otlp.json`。它们与各自 report 配对。错误响应正文、headers、JSON 解析错误和异常栈均在 HTTP/Prompt 边界转为稳定错误码，测试检查整个 OTLP（含 events/status）不含合成秘密、隐藏资料、secret URL 或工作区路径。这里没有检查点持久化或恢复；修正后的 attempt 是新执行，不是从 trace 恢复旧任务，也没有给旧 JS runAgent 自动接 SDK。


发布证据绑定：promote核对Prompt名称、不可变版本、内容/config hash，以及报告execution和运行记录的modelMode/appliedModel与当前模型配置。错误名称、模型或模式，以及将本地mock报告用于外部真实模型模式，均在PATCH之前拒绝。显式confirm不能替代证据一致性；单题通过也不是生产发布批准。

模型凭证传输：携带API key时，非回环MODEL_BASE_URL必须HTTPS；localhost/127.0.0.1/::1本地演练可用HTTP。请求禁止重定向，拒绝发生在fetch之前。
