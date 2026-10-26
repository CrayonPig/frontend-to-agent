# 10 Trace、Observation、Session：一次任务如何串起来

助手回答：“构建通过了，因此 AtlasTable 2.0 支持 virtual。”这句话的问题不在网络，也不在 JSON：C-T20 根本没有说明 `virtual`，构建状态不能证明组件参数存在。要调查它，不能只看最后一句话，还要找出当时用了哪份资料、工具返回什么、哪一版 Prompt 组织了答案，以及校验有没有发现这个越界推断。

本篇建立一套能在下一篇实际运行的观测关系，对应[系列大纲的观测学习支线](../outline.md)。案例编号为 `A30-unsupported-capability`，沿用 `atlas-fixture-01`，问题是“AtlasTable 2.0 有 virtual 参数吗？演示构建通过了吗？”它不是给 AtlasTable 新增能力，而是把 Q05 的未知问题和一个合成只读状态查询放在一起。检索、工具和 Agent 的完整实现仍在后续章节展开；这里先用有限业务步骤学会读执行证据。

## 一次执行是一棵树，会话是多棵树的分组

Trace 是一次执行的关联范围。Observation 是其中一个被观察的动作：普通 span 记录时间范围，generation 额外表达模型调用、模型参数和用量。一个任务根 span 与其子项共享 `traceId`，每个子项有自己的 `spanId`，`parentSpanId` 表示它属于谁。

`examples/atlas-observability` 的真实执行路径会产生下面这棵树。这里列的是源码中的名称，不是预想中尚未执行的模块：

```text
assistant.task
├─ authorize           确认固定演练主体的范围
├─ retrieve.docs       取得本题可访问的候选 C-T20
├─ select.evidence     再检查进入模型的证据范围
├─ tool.build_status   读取合成构建回执
├─ prompt.resolve      解析本次实际使用的 Prompt 版本
├─ model.answer        generation：通过 HTTP 调用模型适配器
└─ answer.validate     检查两个子问题、来源和事实边界
```

同级节点都直接属于 `assistant.task`，没有因为调用顺序相邻就互为父子。若授权或证据检查提前拒绝，后面的节点不应该出现：没有发生的动作不能用空 span 补齐成一棵漂亮的树。真实系统日后加入重排，再记录真正的重排过程，不能把当前简单候选选择写成已实现的 reranker。

Session 用于分组多轮 trace；task ID 用于关联同一个业务任务的不同尝试。用户补充版本可以产生新的 trace，任务中断恢复也可以产生新的 trace，而 session/task 保留原关联。它们都不应该覆盖为同一个长期不变的 trace ID。[Langfuse Session 与 trace 标识说明](https://langfuse.com/docs/observability/features/sessions)，[ID 与分布式追踪](https://langfuse.com/docs/observability/features/trace-ids-and-distributed-tracing)，核对日期 2026-10-26。

## 把业务标识映射到真实字段

在 `src/runtime.ts` 中，`startActiveObservation` 建立活动范围，`getActiveTraceId()` 取回 SDK 生成的 trace ID；`propagateAttributes` 传递允许的用户、会话与业务关联信息。以下是源码关系的摘录，不是另一个独立程序：

```ts
await startActiveObservation('assistant.task', async root =>
  await propagateAttributes({
    userId: principal.userId,
    sessionId: 'session-a30-demo',
    metadata: {
      taskId,
      runId,
      attempt: String(attempt),
      fixtureVersion: 'atlas-fixture-01'
    }
  }, async () => {
    const traceId = getActiveTraceId()
    // 本范围内执行授权、检索、工具、模型与校验。
  })
)
```

完整程序和 import 在示例包内；不要把省略的业务部分当成已上报动作。导出到 OTLP 后，可以按下面的映射核对：

| 业务含义 | 程序中的值 | 采集数据或平台中的对应位置 |
| --- | --- | --- |
| 一次执行关联 | SDK 生成的 trace ID | OTLP `traceId`，平台 trace ID |
| 一个动作及父级 | SDK 生成的 span ID | `spanId`、`parentSpanId` |
| 会话分组 | `session-a30-demo` | `session.id` / Session |
| 合成用户 | `reader-a` | `user.id` / User |
| 同一业务任务 | `taskId` | trace metadata 的 `taskId` |
| 本次运行与尝试 | 随机 `runId`、`attempt` | trace metadata |
| 模型调用类别 | `{ asType: 'generation' }` | observation type / generation |
| 当时采用的资料 | `C-T20@r1` | 检索输出及报告的 `sourceRevisions` |

OTLP 的属性名以实际 SDK 导出为准，报告工具把 `resourceSpans → scopeSpans → spans` 展平后保留了原属性键，便于对照。本次实际采集的 generation 包含 `langfuse.observation.type=generation`、`langfuse.observation.prompt.name=atlas-answer`、版本 2，以及 `langfuse.trace.metadata.runId`；后者在原始属性中是 JSON 编码字符串，读取时不要把外层引号当作业务 ID 的一部分。Langfuse trace ID 通常为 32 位十六进制，span ID 为 16 位十六进制；`A30-demo` 是业务标签，不能直接塞进 trace ID 字段。它们的格式有效也不表示身份可信。

前端 request ID 仍有用：它标记一次入口请求。当前观测示例是 CLI，没有 HTTP 浏览器入口，因此没有编造一个“真实前端请求 ID”；接回第 04 篇服务时，再把入口 request ID 作为受控关联字段加入。

## 先跑本地采集，再用同一个 ID 阅读

从仓库根目录进入示例：

```bash
cd examples/atlas-observability
npm ci
npm run build
npm run demo -- all
```

这会运行真实 SDK，但模型与采集端均为本地 HTTP 替身，不需要账号或密钥。打开 `reports/demo-report.json`，选择一个运行，记下它的 trace ID、任务 ID、Prompt 版本和质量判定；然后在 `reports/otlp.json` 中找同一个 trace ID，检查所有子项的父级。

按这个顺序读，会比从第一行 Prompt 开始翻更有效：先看 `answer.validate` 是否通过，再看 `model.answer` 的候选；有无依据断言时，回看 `select.evidence` 与 `retrieve.docs`；涉及构建事实时，再看 `tool.build_status` 的回执。一个“HTTP 请求完成”的 generation 和一个“业务校验失败”的 span 可以同时存在，因为它们描述的不是同一种成功。

默认 mock 故意能产生“由构建成功推导 virtual 存在”的坏候选。这个失败不是让模型自行回忆原因，而是由外部可记录的输入、工具结果和候选答案重建：C-T20 没有参数依据，构建回执只说明合成构建状态，候选跨越了证据边界。trace 不需要也不应收集模型私密推理。

## 一个 ID 不能承担所有职责

`runId` 在报告中定位这份候选，`traceId` 在观测系统定位动作，`taskId` 把重试或恢复关联起来。实际复现还需要 fixture、Prompt、模型配置、规则版本和工具状态，不能只保存一个 trace 链接。trace 可能被采样或过期删除，也不能代替任务状态库。

并发时同样不能把当前 trace ID 存入全局变量。两个 `runTask` 同时运行，各自的异步范围要继承自己的父节点；第 12 篇用本地采集断言验证是否串线。跨服务或队列则需要显式传播 trace 上下文，业务身份仍由接收端重新验证。[OTel JavaScript 上下文传播](https://opentelemetry.io/docs/languages/js/propagation/)，核对日期 2026-10-26。

最后留意统计边界：一条 trace 能解释本次耗时，不能给出可信 p95；generation 用量不等于任务总成本；抽样后的错误比例不一定等于全部请求的失败率。当前 HTTP 模型替身不提供用量，报告的 usage 与 cost 均保持未知。只要把这些分母分开，链路就能帮助回答“发生了什么”，而不会被误当作“系统已经可靠”的证明。

本篇的完成条件很具体：在本地报告与 OTLP 数据之间定位同一次执行，解释任意一个子项的父级、业务任务与候选来源，并指出它能证明与不能证明的事。下一篇把同一份程序接到 Langfuse 平台，验证记录真正可查询。

[下一篇：11 接入 Langfuse：从平台配置到第一条观测链路](11-langfuse.md) · [学习目录](../README.md)
