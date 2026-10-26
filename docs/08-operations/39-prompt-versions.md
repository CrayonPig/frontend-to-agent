# 39 Prompt 改了，如何知道哪一版影响了结果

A30 问：“AtlasTable 2.0 支持 virtual 参数吗？演示构建现在是什么状态？”助手查询到了构建成功，最后却回答“支持 virtual，可以直接使用”。工具执行没错，文档也正确说明了缺口，错误发生在组织答案时：把构建成功当成了参数存在的证据。

修复可以从 Prompt 开始，但不能止于在配置页面增加一句话。需要知道请求实际取到哪一版、配置是否进入模型请求、答案与引用如何判定，以及改动后是否值得发布。本篇沿第 11–12 篇的 TypeScript 项目跑完整条路径：创建两版 Prompt，经真实 SDK 读取与编译，关联 generation，比较同题结果，再人工移动标签并演练回退。

## 先说清这次实验里的“真实”

代码在 `examples/atlas-observability`。默认模式使用官方 `@langfuse/client`、`@langfuse/tracing`、`@langfuse/otel` **6.0.2** 和锁文件中的兼容 OpenTelemetry 包。Prompt 请求经过本地 HTTP API，模型适配器发出本地 HTTP 请求，真实 SDK 生成 OTLP（OpenTelemetry 导出协议）记录，再由本地收集端接收。它比一个内存 `PromptRegistry` 多验证了序列化、API 调用、版本读取、配置传递与导出链路。

但本地 Prompt API 不是完整 Langfuse 服务，本地模型也不进行语言模型推理。两版答案的差异是有意安排的合成响应，用于检验“错误能否被评分发现，评分能否回到实际 Prompt 和 trace”。这不证明新措辞提高了某个真实模型的质量，也不证明 Langfuse Cloud 已接收记录。外部 Langfuse 与模型端点只有显式选择真实模式、准备自己的服务端配置后才会访问；本教程的验证不创建账号、不配置真实密钥、不调用付费模型。

Node.js 使用 22+。在仓库根目录进入独立示例包并构建：

```bash
cd examples/atlas-observability
npm ci
npm run build
npm run seed-prompts
```

依赖固定在这个示例自己的 `package-lock.json`，不要求文档站安装 SDK。下面命令都在此目录执行。默认本地 Prompt 状态保存在 `reports/local-state.json`，只含合成内容；报告同样不得放入真实凭证或用户对话。

## 让版本记录一次明确的假设

Prompt 名称固定为 `atlas-answer`。版本 1 提供较宽松的组合回答要求；版本 2 明确要求把文档事实和实时构建结果分开，不能从构建成功推断 `virtual` 存在。两版都使用相同配置：

```json
{ "model": "atlas-http-mock", "maxCompletionTokens": 300 }
```

两版正文中的关键差异可以直接在 `src/domain.ts` 检查：版本 1 要求“简短组合资料与构建结果”；版本 2 写明“资料未说明 virtual，必须保留未知；构建成功不能证明组件能力”。共同变量是 `question`、`evidence` 和 `build`，均由本次已授权的合成任务填入。

这里还刻意把版本 2 的 `parameterResult` 固定为 `insufficient_evidence`，因为这是 A30 的链路回归夹具。不能把这个模板推广成回答所有 Atlas 问题的通用提示词，更不能用它在这一题上的通过证明模型学会了证据判断。接入真实模型做质量实验时，要另用不硬编码答案的模板、未参与调试的检查题以及人工核验；本篇先确保版本与评测记录能正确连起来。

这个对比只改变 Prompt 规则，不同时更换模型与输出预算。配置值是本地 HTTP 模型的演示约定，不是供应商模型名或计价声明。实际模板、变量与初始化标签以 `seed-prompts` 创建的内容为准；重复初始化也应读取已有版本，不能悄悄覆盖旧版内容。

创建逻辑使用 `langfuse.prompt.create({ name, type: 'text', prompt, config, labels })`。同一名称的新内容产生新版本；不能修改版本 1 的正文后继续称它版本 1。`production` 和 `staging` 是可移动标签，`latest` 仅表示最近创建的版本，不表示已通过评测。版本和标签语义核对自[官方版本文档](https://langfuse.com/docs/prompt-management/features/prompt-version-control)，日期为 **2026-10-26**。

先各取一次明确版本，再取当前发布标签：

```bash
npm run run -- --prompt-version 1
npm run run -- --prompt-version 2
npm run run -- --label production
```

前两个命令回答“这份固定内容会产生什么可记录结果”；第三个回答“当前环境的发布入口解析成了哪一版”。不能同时传版本与标签，再让应用猜优先级。运行记录要保存解析后的版本，而不只是请求的 `production` 字样，否则标签移动后无法还原过去的选择。

## Prompt 的配置必须真的进入请求

`prompt.config` 在 SDK 类型中是 `unknown`。模板作者能写 JSON，不意味着应用可以把所有字段直接展开到模型请求。示例先检查模型名和输出预算，再传给 HTTP 模型适配器；未允许的配置不能借 Prompt 更新获得新权限或改变网络目标。

读取、编译与调用的关键关系如下。这是源码调用关系的简化示意，完整运行入口是上面的 CLI：

```ts
const prompt = await langfuse.prompt.get('atlas-answer', {
  version: selectedVersion,
  cacheTtlSeconds: 0,
})
const compiled = prompt.compile(variables)
const config = validateModelConfig(prompt.config)

await startActiveObservation('model.answer', async generation => {
  generation.update({ prompt, model: config.model })
  const response = await modelAdapter.generate({ input: compiled, config })
  generation.update({ output: response.output })
}, { asType: 'generation' })
```

`validateModelConfig` 和 `modelAdapter` 是应用职责，不是 SDK 自动提供的业务保证。运行测试需要检查 HTTP 模型端实际收到的配置，而不能只看 generation 上写了一个模型名称。官方说明明确要求应用读取 config 并用于调用，见 [Prompt Config](https://langfuse.com/docs/prompt-management/features/config)。

同样，`generation.update({ prompt })` 关联的是实际读取的 Prompt 对象；仅在 metadata 写 `promptVersion: 2`，不能代替 SDK 的 Prompt 关联。本地当次 `reports/run-spans.json` 的 `model.answer` 应带 `langfuse.observation.prompt.name` 和 `langfuse.observation.prompt.version`，它与 `assistant.task` 共享 trace ID，并有正确父节点。单次运行的原始导出位于 `reports/run-otlp.json`，对比命令对应 `compare-spans.json` 与 `compare-otlp.json`，综合演示对应 `all-spans.json` 与 `all-otlp.json`。`spans.json`、`otlp.json` 与 `http-contract.json` 是最近命令的快照；重复执行同名命令也会覆盖其文件，应把报告与匹配的 trace ID 一同归档。连接真实 Langfuse 后，还要在 generation 详情中核对可点击的 Prompt 版本，而非只凭 HTTP 发送成功宣布平台已处理完成。参见[官方关联方式](https://langfuse.com/docs/prompt-management/features/link-to-traces)，核对日期同上。

## 同一题的三个判断要一起保留

执行对比：

```bash
npm run compare
```

它对同一 A30 合成任务分别使用两版 Prompt，保存 `reports/compare.json`。单次命令保存在 `reports/run.json`，对比两次的完整证据在 `reports/compare.json` 的 `runs` 内；`npm run demo` 才生成综合 `reports/demo-report.json`：候选答案、实际 Prompt、trace ID、质量结果、用量、费用与耗时必须能对应，不能只留一个总分。运行记录的 `sdkVersions`、`modelMode` 与 `environment` 用来区分 SDK 版本、本地脚本响应和外部调用，不能把 `prompt.source: langfuse` 单独解释为已连接 Langfuse Cloud。阅读时按以下顺序核对：

1. 先确认问题、资料、规则版本和模型配置相同，差异确实是 Prompt 版本。
2. 再看候选答案：C-T20 没有给出 virtual 支持信息，构建成功也不能补足；工具状态只能支持“这次查到的构建状态”。
3. 最后看质量判定和报告中的 trace ID，回到 `model.answer` 的输入输出、实际 Prompt 关联与工具 observation，解释为什么失败。

本次本地运行已观察到以下结果；精确耗时和 trace ID 保存在生成报告里，不固定为性能承诺：

| 实际 Prompt | 规则结果 | 关键依据 | 用量 / 费用 |
| --- | --- | --- | --- |
| `atlas-answer@1` | 不通过 | `parameterResult: supported`，把构建成功外推为 virtual 支持 | `null` / `null` |
| `atlas-answer@2` | 通过 | `insufficient_evidence` 与构建 `succeeded` 分别陈述，引用 C-T20 | `null` / `null` |

这两个通过/失败来自 `a30-rule-1` 的有界断言，仍需读者核对原始答案；它不是通用的事实判定器。生成的 `compare.json` 标注 `caseCount: 1` 和 `modelQualityMeasured: false`，避免将这张表解释成真实模型质量基准。

这里的评分不是字符串完全相同检查，也不是“SDK 无错误即通过”。结果必须把未知的组件能力和已查询的动态状态分开。即使候选答案合法、工具成功、OTLP 上报成功，错误的能力承诺仍然导致任务失败。

对比里的耗时是本机 HTTP mock 路径的实际运行时间，不能当真实模型延迟；小样本不能支持可靠 p95。默认 mock 没有返回 token 用量，报告的 `usage` 与 `cost` 都是 `null`；不能按字符串长度伪造 token，更不能因为没有付费调用而把系统总成本填为零。[第 36 篇](36-latency.md)和[第 38 篇](38-cost.md)分别解释如何读这两列。A30 是链路与判定规则的回归题，不代表第 02 篇全部题目、独立质量集或生产分布。

## 先看报告，再移动标签

`compare` 不自动发布。阅读候选答案、规则和版本对应关系后，才显式确认：

```bash
npm run promote -- --version 2 --confirm
npm run run -- --label production
```

推广命令读取对比报告并检查 Prompt 名称、不可变版本、fixture 与评分规则是否匹配，再核对报告与本次执行的模式、模型标识一致，重新读取候选 Prompt 核对正文与实际配置的 SHA-256，再调用 `langfuse.prompt.update({ name, version, newLabels: ['production'] })`，再读取标签验证结果。缺少确认或报告不满足门槛时，应拒绝更新。本地 mock 报告不能拿去外部真实模型模式推广：即使模板内容与配置碰巧相同，模式或模型不匹配仍以 `execution_evidence_mismatch` 拒绝，且不会发送标签 PATCH。实际从平台读取的名称、版本和内容/config hash也必须匹配。`--confirm` 不能跳过这些检查，也不表示已得到生产质量证据。它不同于让调用者传一个 `regressionPassed: true`：判定必须来自实际报告，确认才表达发布意图。

这仍然只是本地教学门禁，不能代替真实组织的身份认证、审批权限和报告防篡改。正式环境必须把操作者、报告内容标识和发布目标纳入可信审计；评测器或模型不能自行取得发布权限。

回退也必须显式操作：

```bash
npm run rollback -- --version 1 --confirm
npm run run -- --label production
```

这一步演示恢复旧配置的机制，并保留回退记录；版本 1 在 A30 中有意表现不佳，回退到它不等于它通过了当前质量门槛。真实事件应选择已知可接受的退路，或停用受影响能力，不能把“能切回去”当作“可以安全继续回答”。确认回退后，新请求读到版本 1，之前的 trace 仍须指向实际用过的版本 2。

实验为了让标签读取可检查，使用 `cacheTtlSeconds: 0`。生产可以启用缓存，但标签移动后实例可能暂时继续使用缓存内容，因此发布观测按实际版本聚合，不能只看标签当前值。官方缓存说明见[此页](https://langfuse.com/docs/prompt-management/features/caching)。

## fallback 也有自己的版本与证据

模拟指定版本不存在：

```bash
npm run run -- --prompt-version 999 --fallback
```

此路径使用 SDK 的 `fallback` 参数，并检查返回对象的 `isFallback`。应用把它记录为 `prompt.source: local-fallback`、`prompt.version: null` 与 `prompt.fallbackVersion: local-v2`，不能声称远端版本 2 被成功读取。SDK 的 fallback 模板不自动继承远端配置；应用必须提供经过验证的本地配置，否则应停止任务。参见[官方 fallback 文档](https://langfuse.com/docs/prompt-management/features/guaranteed-availability)，核对日期：2026-10-26。

检查这次导出时，应能区分远端版本关联与本地替代来源。fallback 不应被计入“远端版本 2 的质量”样本，也不应掩盖缺失版本或配置错误。一个旧的已解析缓存和一个本地替代模板是不同退路，需要不同记录。

本篇完成的验收是：模板通过真实 SDK 的 HTTP 路径创建和读取，配置用于实际请求，Prompt 对象关联到 generation，候选答案与评分回到同一 trace，标签只能在显式确认后改变，fallback 不冒充远端版本。连接自托管或托管 Langfuse 后仍需补做平台落库、UI 关联、权限与删除检查；接入真实模型后仍需重新做代表性评测。下一篇把这次 Prompt 变更并入完整发布组合。

[下一篇：40 一次变更如何安全上线](40-release.md) · [返回学习目录](../README.md)
