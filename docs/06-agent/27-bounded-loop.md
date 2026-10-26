# 27 一个受限的 Agent 循环

选择权开放后，一个循环很容易写出来：把消息交给模型，执行它返回的工具，再把结果交回模型。但“只差一个 while”忽略了最关键的问题：谁决定停止，如何处理重复动作，模型的完成声明需要什么证据，以及下一次调用之前还剩多少预算。

这一篇实现思路的重点是控制面。模型可以提出下一动作，应用持续负责动作集合、授权、资源预算和终态。所有动作与结果都可记录，记录对象是外部行为，不是模型私密推理。

## 一轮里分别保存观察、动作与结果

给每一轮分配 `step`，给每次工具调用分配稳定的调用 ID。模型看到的是当前问题、已经验证的资料、可用动作及有限历史；模型输出结构化动作。执行器先验证结构和范围，再调用工具，把已校验结果放回下一轮输入。

下面是 TypeScript 控制流示意，省略具体适配器实现，不是供应商 SDK 代码：

```ts
for (let step = 0; step < limits.maxSteps; step++) {
  if (clock.now() >= deadline) return stop('deadline')
  if (!budget.canReserveNextCall()) return stop('budget')

  const action = await chooseWithDeadline(context, deadline)
  if (!isAllowedAction(action)) return stop('invalid_action')
  if (action.kind === 'ask_user') return suspend(action.question)
  if (action.kind === 'finish') return validateFinal(action, evidence)

  if (toolCalls >= limits.maxToolCalls) return stop('tool_limit')
  if (seenSameActionWithoutNewEvidence(action)) return stop('no_progress')

  toolCalls += 1
  const result = await executeAuthorized(action, trustedIdentity, deadline)
  appendValidatedResult(context, result)
  await saveCheckpoint({ step, action, result })
}
return stop('step_limit')
```

这里的 `finish` 也需要校验。模型可以结束生成，但不能单方面把业务结果判成通过。若最终答案声称 1.4 支持 `pending`，即使动作名和 JSON 都正确，答案仍然失败。事实检查可以先使用确定性断言与人工评测；它不必伪装成一个全知的自动校验器。

## 限制要在动作发生之前检查

最大步数限制模型选择次数，最大工具调用数限制外部动作，两者不同。一步里若允许多个工具并发，还要逐项预留并发与调用额度。时间限制也不仅是循环顶部看一眼：模型调用和工具请求都应接收剩余截止时间，执行端应有实际超时控制，否则第一步就可能一直等待。

费用预算更容易被写成空壳。若只有调用结束后才拿到用量，不能等账单超额才说“已限制”。可以在调用前按上限预留，结束后结算；无法获得用量时记未知，采用保守限制，而不是按零消耗继续。教学 mock 可用确定的步骤额度测试停止逻辑，但该额度不等于真实模型费用。

取消同样不是停止循环就万事结束。应用可以停止发出下一动作，当前远端调用可能仍在执行；有副作用时应进入待核对状态。本文循环只开放只读工具，写入仍经独立确认流程，这使第一次实验的失败范围更小。

## 重复没有新证据，通常应停止

设想模型连续三次查询相同组件与版本的文档，工具都返回同一修订。把同样结果追加三遍只会让上下文更长，不会增加证据。可以对动作名、规范化参数和证据修订建立指纹；相同动作且无新输入时触发 `no_progress`。

这个规则不能机械地禁止所有重复。构建状态为 `running` 时，经过约定等待后查询可能有意义；但需要工具契约允许、明确轮询间隔、总时间预算及用户任务确实需要等待。教学版本不自动轮询，返回当前观察时间即可。先选容易解释的规则，比让模型任意决定什么时候再试更可控。

权限拒绝也不能转换成“换一个工具试试”。执行器返回 `forbidden` 后，当前资源操作应该停止；模型如需继续，只能处理其他已授权且独立的子任务，不能扩大身份或选择更宽的检索入口。

## 让链路能解释停止原因

一次执行使用一个 trace，循环内按步骤建立 `agent.step`，下面是 `agent.choose` generation 与实际工具 observation。保存工具名、参数摘要、结果类别和可公开的决策摘要，例如“目标版本缺失，需要澄清”；不收集隐藏推理文本。

```text
assistant.task（task-demo-27，attempt-1）
  agent.step（step=0）
    agent.choose → retrieve_docs
    retrieve.docs → C-B14@r1
  agent.step（step=1）
    agent.choose → finish
  task.result → answered；stopReason=completed
```

这是示意链路，不是已采集的模型结果。`stopReason=completed` 表示循环正常结束，质量评分仍单独记录。达到 `step_limit` 时，任务结果应明确未完成；不能把最后一段半成品直接改成正式答案。用户可见提示应说明已确认的内容、缺口及下一步，不需要暴露内部工具参数或权限细节。

## 用脚本化选择器验证控制面

在接真实模型之前，让 mock 选择器按预设序列返回动作：正常检索后结束、立即请求澄清、永远重复同一工具、返回未知工具、超过最大步数、工具超时。这样能检查每一种停止原因，不消耗付费模型调用。

验收时不仅看返回值，还检查最大调用数确实没被超过、拒绝动作没有执行、步骤编号连续、工具结果与对应调用 ID 一致。再把 `finish` 的答案改成错误版本，确保它不会因为循环正常退出就被评为任务成功。

当前可运行版本在 `examples/atlas/execution.mjs`，使用 `runAgent` 注入脚本选择器，实际动作字段为 `type`，只开放 `build_status`、`ask`、`finish`；并未实现上篇目录中的检索与比较动作。它覆盖步骤、工具次数、墙钟时间和合成选择额度限制。首次创建任务时将 `deadlineMs` 转成绝对时间 `deadlineAt`，随业务检查点保存；恢复直接沿用这个截止时间，不因传入更大的 `deadlineMs` 延长。选择前、等待选择结果时及选择完成后都检查剩余时间。`maxCostUnits` 每次选择预留一个教学单位，不是货币费用；真实费用约束仍需供应商用量与定价适配。

实际 `finish` 只检查答案为非空文本，质量由独立评测判断；没有实现示意中的通用 `validateFinal`。重复调用由有界预算终止，目前没有 `no_progress` 指纹去重。实际观测记录以 `agent.choose` 为父，关联对应 `tool.build_status`，并记录 `task.result` 的停止原因；选择器是脚本，因此这次选择记录为 span，不冒充模型 generation。尚未增加图中的 `agent.step` 层。上述差异保留在覆盖说明里，避免把概念图误认成运行输出。

从仓库根目录运行 `node --test examples/atlas/test/*.test.mjs`，可以验证当前控制面。它不会请求真实模型，也不会把固定答案的通过率当模型质量。

这些测试证明的是循环控制和边界，不是模型会选对动作。下一步需要处理进程中断：如果第一轮已经完成，系统重启后该从哪里继续？

[上一篇：26 固定流程的分支越来越多，下一步该由谁决定](26-agent-decision.md) · [下一篇：28 任务中断以后，如何安全继续](28-recovery.md) · [返回学习目录](../README.md)
