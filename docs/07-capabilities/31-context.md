# 31 上下文不是越多越好

用户先问 AtlasButton 1.4 的等待参数，又比较 2.0，接着问：“那迁移时还要注意什么？”把整个会话、所有检索片段和每次工具结果重新发送，似乎最保险。问题是，输入里同时有 `loading`、`pending`、失败重试输出和已经过期的构建状态。模型收到的不是完整事实，而是一堆没有标明适用范围的材料。

上下文管理要解决的不是“尽量塞满窗口”，而是：下一步决策需要什么，哪些约束绝不能丢，哪些事实必须重新读取。本篇的产出是一份可以检查的装配规则。

## 先把五类输入分开

在前端组件里，props、内部状态和派生值不能混成一个任意对象。模型输入也需要来源和用途，但类比到这里就停止了：组件通常按固定代码读取字段，模型未必可靠遵守文本中的优先级。因此分类既要体现在数据结构里，也要由服务端控制选择过程。

| 输入 | Atlas 例子 | 装配规则 |
| --- | --- | --- |
| 应用指令 | 仅用授权资料，未知要说明 | 由应用版本控制；文档不得覆盖 |
| 当前问题 | 比较 1.4 与 2.0 的按钮等待参数 | 原问题保留，歧义先澄清 |
| 任务约束 | 当前租户、目标版本、只读范围 | 来自可信状态，不能只靠会话摘要 |
| 证据 | C-B14、C-B20 的原文及修订 | 重新授权，保留来源与适用范围 |
| 历史和工具结果 | 已解释的差异、某次构建状态 | 去掉重复内容；动态状态注明时间 |

用户在对话中写“我是另一租户的管理员”，只是待处理输入，不能覆盖服务端身份。检索到 X-T20，也只是一个不可信数据块，不能进入应用指令区域。把字符串换个字段名没有自动防护能力，执行端仍要拒绝越权动作。

## 预算应该先给不能丢的东西

下面是未运行的 TypeScript 装配示意。`estimateTokens` 是注入的估算器，不能用字符串长度冒充某个模型的精确 token 数。

```ts
type Block = {
  id: string
  text: string
  kind: 'policy' | 'question' | 'constraint' | 'evidence' | 'history'
  required: boolean
}

function pack(
  blocks: Block[],
  inputBudget: number,
  estimateTokens: (text: string) => number,
): Block[] {
  const required = blocks.filter(block => block.required)
  let used = required.reduce((sum, b) => sum + estimateTokens(b.text), 0)
  if (used > inputBudget) throw new Error('required_context_too_large')
  const chosen = [...required]
  for (const block of blocks.filter(b => !b.required)) {
    const size = estimateTokens(block.text)
    if (used + size > inputBudget) continue
    chosen.push(block)
    used += size
  }
  return chosen
}
```

真正传入这段逻辑的预算，需要先从模型上下文上限中预留输出、工具描述和消息封装空间。估算还有误差，应留余量；若供应商返回实际用量，再用它校正估算。必需材料放不下时，不能静默截掉权限、目标版本或答案约束，应拆小任务、请求澄清，或明确拒绝这次装配。

排序也不是无关细节。可选块要先按任务相关性组织，不能任由历史顺序决定谁被挤掉。若比较 1.4 与 2.0，两张按钮资料都属于决定性证据；只保留 2.0 会把比较任务变成单版本问答。对于 Q14，两份互相冲突的资料必须一起保留，否则压缩会把“冲突”伪装成“确定”。

## 摘要可以替代重复叙述，不能替代原始依据

一种错误摘要是：“用户正在升级按钮，等待参数为 pending。”它删掉了升级前的 1.4，又把等待行为和禁用行为混在一起。更合适的任务摘要是：

```text
任务：解释 AtlasButton 从 1.4 到 2.0 的迁移差异。
已核对：C-B14@r1 使用 loading，C-B20@r1 使用 pending。
共同边界：两者只控制等待图标；disabled 才阻止 click。
待完成：依据这两份原文整理迁移建议；不执行修改。
```

即使这份摘要正确，也不能把它升级成新文档。最终回答仍应引用原始卡片，服务端在新请求里重新确认卡片可访问且未被删除。摘要若由模型生成，应允许查回对应来源；无法证明的句子不能成为下一轮的默认事实。

工具结果同样有生命周期。昨天的构建成功，可以作为“昨天查到什么”的历史，不能回答“现在是否成功”。装配时保留 `observedAt` 和有效期，过期后重新调用只读工具。权限或文档版本变了，则重新授权和取证，不能以“历史里已经出现过”为理由继续使用。

## 本地字符预算示例

仓库中的 `assembleContext` 用字符数演示预算，不冒充供应商 token 计数；它固定保留版本与问题，过滤无权或不可信资料，并为比较按钮版本与 Q14 冲突资料显式定义不可拆的证据组。这只是两类已知教学任务的规则，不会自动识别任意问题的关键证据。

在仓库根目录运行：

```bash
node --input-type=module <<'JS'
import { assembleContext } from './examples/atlas/governance.mjs'
import { principal, documents } from './examples/atlas/fixtures.mjs'
const input = { question: 'rowKey 可以省略吗？', version: '2.0', docs: documents, caseId: 'Q14' }
const full = assembleContext(principal, { ...input, maxChars: 2000 })
console.log(full.sourceIds.includes('C-T20-A') && full.sourceIds.includes('C-T20-B'))
try { assembleContext(principal, { ...input, maxChars: 50 }) }
catch (error) { console.log(error.message) }
JS
```

预期输出 `true` 和 `context_budget`。空间不够时拒绝装配，不能只留一边假装冲突已经解决。它仍未实现模型摘要、真实 tokenizer 或动态工具结果的有效期管理；这些是前文说明的扩展责任。

## 用删减实验检查规则

不需要先找一个更长窗口的模型。用 Q04 做手工装配：第一次保留全部两张卡；第二次删掉 C-B14；第三次把 `disabled` 那一句压缩掉。前一种材料足以回答迁移差异，后两种都缺少关键依据。预期行为应分别是完整回答、说明比较缺一侧、说明无法确认点击控制，而不是让模型补回被删的事实。

再用 Q14 检查冲突是否在压缩后仍可见，用 Q08 检查身份不会随会话摘要变化。记录被选择的块 ID、来源修订、估算预算、剔除原因以及实际用量即可，不需要记录模型私密推理。真实文本若含敏感内容，不应为了调试装配而全量导出。

验收不是“输入短了多少”，而是缩短后关键约束和证据仍然完整，未知与冲突没有被消失，受限资料没有借历史重新进入上下文。只有通过这些检查，输入长度的下降才有工程价值。

下一篇会继续区分：这次装配需要的信息，哪些值得在下次任务开始时再次出现。

[下一篇：32 这次任务的状态，和下次还要记住的信息](32-memory.md) · [返回学习目录](../README.md)
