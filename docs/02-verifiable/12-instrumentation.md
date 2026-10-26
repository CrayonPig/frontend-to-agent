# 12 自动埋点之外，还需要记录哪些业务动作

接上一个模型 SDK 的自动埋点后，平台能看到请求和响应。但 Q03 仍可能答错：服务端选了 C-B20，模型只是忠实解释了错误版本的资料。此时 generation 本身没有技术错误，缺少的是“为什么选了这些材料”的业务证据。

自动埋点擅长观察它认识的库调用，手动埋点补上应用自己的决定与检查。两者不是越多越好；一条模型调用被上报两遍，会让调用数与成本统计都失真。

## 用动作边界命名，不把内容写进名字

本系列先固定几个名称，后续随功能实际实现再增加：

| 动作 | 记录方式 | 需要回答的问题 |
| --- | --- | --- |
| `request.prepare` | 手动 span | 输入是否完整，身份与版本怎样确定 |
| `model.answer` | generation，自动或手动选一种 | 哪个模型与 Prompt 产生候选结果 |
| `answer.validate` | 手动 span | 结构、引用范围和业务检查通过了吗 |
| `retrieve.docs`、`rerank.docs` | 对应能力实现后再加 | 候选如何变化，哪些允许资料被采用 |
| `tool.build_status` | 执行工具时记录 | 执行端是否授权，返回是否有效 |
| `task.transition` | 状态转换记录 | 为什么继续、停止或等待确认 |

动作名保持稳定，题目、版本和 task ID 放字段里。不要命名为“reader-a 问了完整问题……”，否则检索、聚合、脱敏都会更困难，名称还可能泄露输入。未实现的检索或工具也不能先写成“已执行”的空 span，制造不存在的链路。

## 父子关系来自活动范围

以下是第 11 篇初始化之后的 TypeScript **局部示意**，`prepare`、`adapter`、`validate` 由应用实现，不能独立运行：

```ts
await startActiveObservation('assistant.task', async root => {
  const prepared = await startActiveObservation('request.prepare', async span => {
    const value = prepare()
    span.update({ output: { caseId: value.caseId, sourceIds: value.sourceIds } })
    return value
  })

  const candidate = await startActiveObservation('model.answer', async generation => {
    const value = await adapter.complete(prepared)
    generation.update({ model: value.modelVersion, output: { finish: value.finish } })
    return value
  }, { asType: 'generation' })

  const result = await startActiveObservation('answer.validate', async span => {
    const value = validate(candidate, prepared)
    span.update({ output: { resultKind: value.kind } })
    return value
  })
  root.update({ output: { resultKind: result.kind } })
})
```

这里每个子动作在同一个任务范围内完成，返回值继续走业务路径。若使用已有自动集成，它已经创建 generation，就删掉手动创建同一 generation 的那一层，保留外层业务 span。不能简单把所有 SDK 包装都套上 `observe` 再假设平台会替应用去重。Langfuse 支持手动范围与自动集成组合，但边界由应用设计；API 依据[官方埋点说明](https://langfuse.com/docs/observability/sdk/instrumentation)，核对于 2026-10-26。

## 异步正常，脱离范围却可能串错

在活动回调里 `await` 子操作，可以保留调用范围。把工作丢给一个稍后运行的队列再立刻结束根任务，则不能假装仍是同一段同步嵌套。需要明确队列生产者、消费者和重试尝试的关系：消息携带受控 trace 上下文与业务 task ID，消费者提取后建立执行范围；如果选择新的 trace，就用业务 ID 或链接关联。

概念流程是 `inject(activeContext, carrier)`、传输 carrier、`extract(carrier)`、在提取的上下文内启动消费者 span。具体代码随 HTTP、队列库和传播器而变，本篇不虚构一个通用队列 SDK。跨服务上下文传播的机制依据 [OpenTelemetry JavaScript 文档](https://opentelemetry.io/docs/languages/js/propagation/)，核对于 2026-10-26。

这份 carrier 不是授权票据。消费者仍需验证身份与任务许可，不能因为上游 trace 写着 `tenantId` 就拥有对应权限；对外发送时也要过滤可传播字段。父子关系只能解释执行归属，不能为执行赋权。

## 在导出之前缩小信息面

最稳妥的第一步是少采：Q03 只留题号、目标版本、已授权来源 ID 和结果类别，不留整份文档。异常对象也先转换成稳定错误类别，不把 HTTP 请求配置原样塞入 `output`。

如果使用自动埋点，要检查它是否默认捕获完整 Prompt、响应和工具参数。加入 Langfuse 的 `mask` 也不代表所有内容都已安全。以本篇固定的 `@langfuse/otel@6.0.2` 类型说明为准，该钩子处理特定输入、输出与 observation metadata，传播的 trace metadata 不在同一遮蔽范围；另一条独立 OTel exporter 也有自己的导出路径。因此要对原始采集、传播字段、Langfuse 导出、其他 exporter、控制台和本地文件逐条检查，而不是只验证一个字符串替换函数。[数据脱敏官方说明](https://langfuse.com/docs/observability/features/masking)，核对于 2026-10-26。

可以使用白名单摘要函数：只构造 `caseId`、允许的 `sourceIds`、`resultKind` 和安全错误类别；其余字段根本不进入遥测对象。本地 `examples/atlas/trace.mjs` 采用字段白名单并校验允许来源，验证的是这种应用级边界，并没有连接 Langfuse。

## 错误状态与质量评分仍分开

假设 `answer.validate` 发现引用未知文档，可以把该动作记录为校验失败；假设 Q05 正确返回资料不足，执行链路可以正常结束，但结果类别应保留为 `insufficient_evidence`。如果评测确认这个拒答符合题意，任务评分可以通过。这不是矛盾，而是不同层面在回答不同问题。

反过来，模型顺利输出错误参数时，generation 可能技术成功，任务评分失败。不要为了让图表红绿一致，强行把其中一层覆盖掉。每个评分还应记录来源与规则版本，后续修改判定规则才能解释历史差异。

## 对两条并发链路做一次检查

本篇验收用两个合成请求：一个 Q03 正常回答，一个 Q05 资料不足。检查它们的父子 ID 不串线，任务 ID 不混用，每条模型调用只有一个 generation；错误或停止都能找到原因。再注入一个越权来源 ID，验证它不会进入本地导出记录。

本地测试只能证明记录构造与部分父子关系约束。真实 Langfuse 验证还需按第 11 篇步骤实际上报、查看树并检查导出数据；未完成之前不宣称平台接入成功。保留这条限制不是降低标准，而是明确接下来需要补的证据。

到这里，助手不仅能返回结果，也能解释一次执行用了什么允许资料、哪个步骤失败以及如何关联评测。下一部分才开始扩大知识规模，让检索成为一个有输入、输出和验证标准的新动作。

[学习目录](../README.md)
