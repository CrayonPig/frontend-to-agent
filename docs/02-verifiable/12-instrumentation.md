# 12 自动埋点之外，还需要记录哪些业务动作

第 11 篇能把模型调用送到 Langfuse，但一条 generation 仍不能解释“为什么拿这些资料回答”。A30 的坏候选有合法 JSON，模型 HTTP 请求也正常结束，却把构建成功当成参数存在的证据。要定位这个错误，必须把授权、候选、工具结果与答案校验放进同一次执行。

本篇直接检查 `examples/atlas-observability` 已实现的业务路径，不再另写一组没有实现体的 `prepare()`、`validate()` 片段。目标是能从一条失败回到相应动作，同时证明并发、脱敏与采样没有破坏这份证据。对应范围见[系列大纲中的观测学习支线](../outline.md)。

## 先把自动与手动的责任分清

当前包通过自写 `fetch` 适配器访问 Chat Completions HTTP 接口，没有安装模型 SDK 自动埋点。因此 `model.answer` generation 由应用手动创建，而不是在自动生成的 generation 外又包一份同名调用。将来若换成带自动集成的模型客户端，应保留外层业务步骤，删除重复的模型 generation，再检查真实调用数与记录数是否一致。

Langfuse 支持活动范围、包装函数与自动集成组合，但它不会自动理解 Atlas 的权限、版本和质量规则。哪些步骤值得记录，来自业务因果关系。[官方埋点机制](https://langfuse.com/docs/observability/sdk/instrumentation)，核对于 2026-10-26。

| 实际动作 | 记录的业务证据 | 当前实现到哪里 |
| --- | --- | --- |
| `authorize` | 允许/拒绝与策略版本 | 检查固定合成主体，不是真实登录系统 |
| `retrieve.docs` | `candidateIds`、`sourceRevisions` | 为 A30 取得授权 fixture；不是 Elasticsearch 或向量检索 |
| `select.evidence` | 被选来源或拒绝类别 | 拒绝夹入其他租户资料；不是语义重排器 |
| `tool.build_status` | 组件、版本、构建 ID、状态和观察时间 | 只读合成回执，observation 类型为 tool |
| `prompt.resolve` | 实际版本、来源、是否 fallback | 通过真实 LangfuseClient 获取与编译模板 |
| `model.answer` | model、配置、Prompt 关联、候选与已知用量 | 真实 HTTP 请求；默认请求本地替身 |
| `answer.validate` | 分项断言、规则版本、质量结论 | 有限合成规则，不是通用语义裁判 |

区分这些限制不是把实现退回提纲，而是让记录对应真实发生的动作。简单候选取得也可以被观察；没有 rerank 算法就不应该凭名称宣称重排效果。

## 从候选到答案，记录保留不同阶段

A30 的候选是 C-T20@r1，最终选中也只有它。两处都记录仍然有价值：后续引入更多候选时，能够判断相关文档是在召回时丢失，还是选择时被丢弃。不要只保存最终引用，再把它当作完整检索过程。

`select.evidence` 在组装模型输入之前验证范围。故障注入把其他租户卡片混入内部选择阶段时，该步骤只记录 `rejected: true` 与 `evidence_scope`，不会把隐藏卡片 ID 或正文写进输出。随后直接结束任务，工具、Prompt 和模型节点都不应出现。测试者持有完整夹具，不意味着模型或日志能读取它。

正常路径中，构建回执和 C-T20 分别进入 Prompt 变量；模型拿到的原始业务材料与导出的观测摘要不是同一个对象。generation 的 input 只记录题目 ID 与已授权来源 ID，不复制整份资料；generation 的 output 保留这次合成候选，以便质量核对。真实业务迁移时，需要重新决定哪些候选内容可以保存，而不是照搬明文策略。

下面摘取实际模型埋点中的关键调用，完整函数在 `src/runtime.ts`，片段不单独执行：

```ts
await startActiveObservation('model.answer', async gen => {
  gen.update({
    ...(prompt.isFallback ? {} : { prompt }),
    model: actualModel.model,
    modelParameters: {
      max_completion_tokens: appliedConfig.maxCompletionTokens
    },
    input: { caseId: CASE, sourceIds: selected.map(d => d.id) }
  })
  const result = await complete(
    actualModel, input, appliedConfig.maxCompletionTokens, deadlineAt
  )
  gen.update({ output: result.answer })
  return result
}, { asType: 'generation' })
```

`prompt` 是本次由 SDK 取得的对象，才能把实际模板版本与 generation 关联；不能在 metadata 随手写一个“production”就当作实际版本。fallback 没有远端版本，不伪造这个关联，改用本地来源标记。完整代码还记录可获得的用量和错误类别；外部接口没返回用量时不传入一个虚假的零。

## 让故障落在它真正发生的位置

在示例目录执行：

```bash
npm run compare
```

该命令以 `Promise.all` 并发运行同一个 A30 的两个模板版本，分别建立根 trace。模型替身按模板返回故意错误和符合预期的候选；这不是对真实模型做质量比较，而是在检验链路和判定是否能区别它们。

查看 `reports/compare.json` 和 `reports/compare-spans.json`。每条正常走完整流程的 trace 应有 8 个 observation：一个根，七个直接子项；每个子项的 `parentSpanId` 指向自己那条 trace 的根，而不是另一次运行的根。`runId` 不同，`taskId` 同为 `A30-compare`，用来表达“同题比较”而不是“同一次执行”。

故意错误版本中，`model.answer` 的 HTTP 调用正常结束，`answer.validate` 报 `quality_failed`。候选声称 virtual 存在，但 C-T20 只提供未知；这时问题在证据遵循，不是网络超时。符合预期的版本整体结果为 `insufficient_evidence`，因为参数部分仍未知，同时报告构建状态。准确保留未知可以通过质量检查，不能为了把所有结果变成 `answered` 而补造事实。

报告分别保留 `qualityStatus`、`quality.pass` 与业务 `resultKind`。未通过校验的候选不会被包装成一个新的“成功任务类别”；执行失败、技术错误和业务质量也不要塞进同一个绿色状态。第 30 篇会利用这些记录完成失败复盘，而不是让模型回忆自己的私密思考。

## 脱敏要检查 HTTP 出口，不只测一个函数

当前实现有两道收缩：业务侧只构造允许字段；`LangfuseSpanProcessor` 的 `mask` 在上报前递归处理敏感键和合成 canary。测试把 `SYNTHETIC_SECRET_CANARY` 写入 generation 的诊断 metadata，然后检查本地采集器收到的**实际 OTLP 正文**：应出现 `[REDACTED]`，不应出现原 canary、合成 secret key 或隐藏来源 ID。

这里证明的是这条导出路径和已注入字段。它不是通用敏感信息检测产品，也不能保证任意秘密都能被正则识别。尤其在固定 SDK 6.0.2 中，`propagateAttributes` 产生的 trace metadata 不经过同样的 mask；因此那部分从一开始就只放 task/run/attempt 等合成白名单。不要先传播原始问题，再寄希望于 generation 的遮蔽替它补救。[数据脱敏说明](https://langfuse.com/docs/observability/features/masking)，核对于 2026-10-26。

NodeSDK 还关闭了自动资源检测，避免把宿主机、进程与命令行路径附到遥测资源。这是资源层面的收缩，不属于 observation mask。也要检查其他出口：候选报告、stdout、异常日志、第二个 OTel exporter 和平台导出。SDK 的一个 mask 不会替应用处理所有文件或第三方 exporter。示例本地采集器不持久化认证请求头，但 `reports` 仍可能包含合成候选；替换为真实输入前，应先制定文件访问与删除规则。

## 采样改变记录数量，不改变任务事实

先确认样本完整，再尝试关闭采样：

```bash
npm run run -- --prompt-version 2 --sample-rate 0
```

任务仍应得到结果，但本次 `reports/run-spans.json` 为空。配置使用 `ParentBasedSampler` 包装 `TraceIdRatioBasedSampler`，按根 trace 的选择保持子项一致，不能随机删掉几条子 span 再把残缺树当成完整执行。测试对 rate=0 的行为有断言；其他比率的长期分布不是本次测试结论。[Langfuse 的 OTel 采样说明](https://langfuse.com/docs/observability/features/sampling)。

不要在调试首次上报时就用低采样率，否则“找不到这条请求”可能只是没被采到。也不能把只保留失败任务的观测样本当作线上成功率分母。任务完成率需要知道全部请求，trace 主要用于解释具体执行；两者可以关联，不能互相替代。

## 同进程继承，不等于跨服务自动继承

两个比较任务在各自活动回调内 `await` 子动作，SDK 能沿异步上下文保持归属。当前包没有跨服务队列，不把它画成已验证能力。加入队列时，需要在发送端注入受控追踪上下文，在消费者提取并开启新范围，或建立新 trace 后使用 task ID/链接关联；业务状态和授权仍需独立验证。

更不能把 `sessionId` 当作访问凭证，或让外部提供的 metadata 改变租户。trace 的作用是解释调用关系，不能赋予工具权限。采集、查看和导出也各有边界：在平台上只给确有需要的人项目权限，使用独立演练项目，不因环境筛选器存在就认为不同租户已隔离。Langfuse 的项目角色与 API key 能访问的范围需按实际部署核对；环境标签不是 RBAC。[官方访问控制说明](https://langfuse.com/docs/administration/rbac)。

本教程建议演练数据采用短保留期，并明确谁能导出、如何删除本地报告与平台数据。设置期限是操作约定，不代表包已自动清理平台；测试也没有创建平台成员或验证真实项目角色。外部平台的权限、入库与 UI 验收应按第 11 篇另行完成。

## 把验收落在可重复的证据上

运行 `npm test`，检查真实 SDK 是否把两个并发 trace 分开、Prompt 关联是否正确、canary 是否在 HTTP 出口消失、越权证据是否在模型调用前被拒绝、rate=0 是否只影响导出。测试通过后，再读一条坏候选的 trace，确认能够从最终失败沿记录回到 C-T20 与构建回执。

本地采集通过说明链路结构和出口边界可检查；在 Langfuse 中查到同一条 trace，才完成平台接入验证；真实模型任务质量还要由独立评测确认。这三个结论各有证据，组合起来才是一条可以继续扩展的观测路径。

[下一篇：13 文档放进 Prompt 就够了吗](../03-knowledge/13-knowledge-strategy.md) · [学习目录](../README.md)
