# 39 Prompt 改了，如何知道哪一版影响了结果

某天 Q03 又开始把等待图标解释成禁止点击。代码没有变，模型名称也没变，但运行时读取的 Prompt 已经被更新。若 trace 只记录 `production`，排查时看到的可能是标签现在指向的内容，而不是出错那次实际使用的内容。

本篇把模板、变量、配置、不可变版本和发布标签分开，完成一次可追溯的变更演练。版本治理不保证 Prompt 更好，它让比较与回退有明确对象。

## 版本固定内容，标签选择版本

教学模板 `atlas-answer` 的版本 1 要求“简短回答并附依据”；版本 2 增加“分别检查目标版本、行为断言和未知，不从等待图标推断禁止点击”。两个版本都只是一种待评测的输入设计，不能用新版本号证明效果提升。

版本 1 发布后保持内容不变，修改产生版本 2。`staging`、`production` 是可以移动的选择标签，今天与明天可能指向不同版本。实际执行应在开始时解析出具体版本，并在本次任务中使用同一个已解析内容，避免执行一半因标签移动而混入新模板。

Langfuse 支持按版本或标签读取 Prompt，未指定时默认读取 `production`；`latest` 表示最近创建的版本，不是质量已验证的版本。具体语义与错误规则见[官方版本文档](https://langfuse.com/docs/prompt-management/features/prompt-version-control)，核对日期：2026-10-26。

## 先做一次本地发布演练

不接平台也能明确规则。维护一份不可变模板集合、一份标签映射和一份发布记录：

```text
templates: atlas-answer@1, atlas-answer@2
labels before: production -> 1, staging -> 2
comparison: fixture atlas-fixture-01 + evaluation-rule-1
decision: 保留 / 推广 / 撤回，并附评测报告标识
labels after: 只有获准推广才允许 production -> 2
```

仓库提供不联网的 `PromptRegistry`，可在根目录运行以下门禁演练：

```bash
node --input-type=module <<'JS'
import { PromptRegistry } from './examples/atlas/governance.mjs'
const registry = new PromptRegistry()
registry.add('1', '简短回答并附依据')
registry.add('2', '核对版本、行为与未知，附依据')
registry.promote('production', '1', { approved: true, regressionPassed: true })
try {
  registry.promote('production', '2', { approved: true, regressionPassed: false })
} catch (error) { console.log(error.message) }
console.log(registry.resolve('production').version)
JS
```

预期输出 `release_gate` 与 `1`。这里的布尔值只是模拟审批和回归输入；真实应用必须从受信任的审批与报告记录取得，不能接受模型自行填 `true`。此类没有平台请求、SDK 缓存或本地 fallback 实现；后文是扩展设计与可选接入。

使用版本 1、2 分别跑同一批题，重点看 Q03 行为边界、Q05 未知、Q08 越权、Q09 注入、Q14 冲突。候选答案、实际模板版本、模型配置、资料修订、trace ID 和判定规则必须能互相对应。真实模型需重复运行观察波动；确定性 mock 只验证记录与发布门禁，不证明文字改动改善了模型。

如果版本 2 在 Q03 更好却在 Q08 泄露隐藏文档，不能用平均分掩盖安全退步。发布决定应按预先约定的门槛执行，并保留拒绝推广的记录。移动标签属于发布动作，不是模型或评测脚本可以自行获得的权限。

## 可选 Langfuse 接入：关联实际使用的对象

本系列可选接入固定 `@langfuse/client@6.0.2` 与 `@langfuse/tracing@6.0.2`，沿用第 11 篇的 Node.js 22+ 和观测初始化。已核对[官方 npm 元数据](https://registry.npmjs.org/@langfuse/client/6.0.2)：client 要求 Node.js 22+，并依赖同系列 core、tracing，OpenTelemetry API peer 范围为 `^1.9.0`。核对日期：2026-10-26。

下面是未连接平台执行的 TypeScript 接入示意；需要先按第 11 篇配置服务端环境与导出生命周期。`invokeAdapter` 是应用自己的模型适配器，不是 Langfuse API。模板在平台上须预先建立为 text 类型，包含 `question` 与 `evidence` 变量。

```ts
import { LangfuseClient } from '@langfuse/client'
import { startActiveObservation } from '@langfuse/tracing'

const langfuse = new LangfuseClient()
const prompt = await langfuse.prompt.get('atlas-answer', { version: 2 })
const input = prompt.compile({
  question: 'AtlasButton 1.4 等待时怎样阻止点击？',
  evidence: 'C-B14@r1: loading 显示等待图标；disabled 阻止 click。',
})

await startActiveObservation('answer.compose', async generation => {
  generation.update({ prompt })
  const answer = await invokeAdapter(input)
  generation.update({ output: answer })
}, { asType: 'generation' })
```

`prompt.get` 与 `compile` 的形状核对自[官方入门](https://langfuse.com/docs/prompt-management/get-started)；将 Prompt 对象关联到 generation 的方式核对自[关联 trace 文档](https://langfuse.com/docs/prompt-management/features/link-to-traces)，日期同上。不要只在业务 metadata 里记一个标签后就认为平台知道实际版本。示例仅含合成内容；真实输入输出仍须按第 12 篇在导出前脱敏。

模板自带模型配置时，应用仍要校验并实际应用这些值。把配置存进平台不会自动切换适配器的模型、温度或输出上限；运行记录应来自实际执行参数，而不是模板中的期望参数。

## 缓存与 fallback 不能隐身

Prompt SDK 可以缓存内容，标签移动后不同实例未必同时使用新版本。发布验证应按 generation 上的实际版本统计，而不能只看 UI 上标签已更新。刷新策略、冷启动和离线行为要纳入演练。参见[官方 Prompt 缓存说明](https://langfuse.com/docs/prompt-management/features/caching)，核对日期：2026-10-26。

如果读取失败而使用本地模板，需要明确记录 `promptSource: local-fallback`、本地模板版本以及失败类别，不能仍标为远端版本 2。缓存中的已解析版本与本地 fallback 也不同：前者有已知远端版本，后者是应用自己的退路。若退路不满足当前输出契约，应停止任务，而不是随便拿一段旧提示词继续。

实践时模拟标签从 1 移到 2，再回到 1；让一个请求在移动前解析，一个在移动后解析；最后模拟平台不可用。验收要求每次运行都能找到实际模板，fallback 有独立标记，回退不覆盖历史版本，且安全回归失败时标签不会被自动推广。随后才能把 Prompt 与模型、索引、工具和 Skill 一起纳入完整发布。

[下一篇：40 一次变更如何安全上线](40-release.md) · [返回学习目录](../README.md)
