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

## 用真正的循环生成 SDK 链路

`examples/atlas-observability` 现在包含一个 TypeScript 受限循环。每一轮把已有文档、构建结果与动作历史交给选择器；选择器返回动作，执行器校验并派发，工具结果写回状态，然后才进入下一轮。它不是预先执行完一串工具、最后补几个带 Agent 名字的 span。

实验只允许 `read_docs`、`build_status`、`finish`。文档读取与构建查询限定于合成身份可见的 AtlasTable 2.0；未知工具与写操作都不执行。动作集合比第 26 篇的设计目录更窄，没有自主分享、保存草稿或设备定位。这个收缩使“选错了下一步”可以在受控范围内复现。

从仓库根目录执行：

```bash
cd examples/atlas-observability
npm ci
npm run build
npm run seed-prompts
npm run agent-compare
```

比较器对同一 A30 问题运行两种选择策略。`repeat-build` 忽略已经得到的结果，持续要求查询构建；`evidence-first` 根据状态缺口选择动作：没有文档先读文档，没有构建状态再查询，两类证据齐全后才能结束。后者是读取状态的脚本策略，不是已经验证过的真实模型能力；它的作用是给循环一个可检查的正常路径。

每次执行产生真实 SDK trace，结构包括：

```text
agent.task
  agent.step
    agent.choose
    工具 observation 或结果校验
  agent.step
    agent.choose
    工具 observation 或结果校验
  task.stop
```

同一轮的选择与执行是 `agent.step` 下的子记录，下一轮不是上一工具的子记录。需要看 `step`、实际动作和停止原因，不能只靠 span 的排列顺序推测发生了什么。第 30 篇会用实际导出文件验证这棵树，并对照“提出了第三次调用”与“第三次工具真的执行了”的差别。

默认选择器在进程内运行，`agent.choose` 记为 span；若使用 HTTP 选择器，则记录实际请求对应的 generation，并保留模型与用量是否已知。显式选择这条路径：

```bash
npm run agent-compare -- --http-selector
```

默认仍调用本地 HTTP mock，不需要密钥，也不产生真实模型费用。HTTP 模式证明适配器实际把状态发给选择服务、解析动作并回填工具结果；mock 的正确选择不能代表真实模型正确率。真实平台与模型的可选配置沿第 11 篇与实验包 README，不在本篇创建账号或执行付费请求。

## 怎样知道循环真的受限

重复策略应在工具预算耗尽时停止，且执行次数不超过上限。模型或脚本要求第三次调用时，执行器可以记录被拒绝的选择，但不能为了“记录完整”先把工具执行完再说超预算。最大步数则约束整个选择循环；时间截止检查应发生在等待选择前后，而不是只限制工具请求。

本节的 SDK 循环默认最多 4 步、2 次工具调用、4 个合成选择额度，默认截止时间为创建后 5000ms。选择前预留一个额度，并在选择前后检查截止时间；HTTP 选择请求也受剩余时间限制。`maxCostUnits` 的合成额度不是金额，真实货币预算仍需结合供应商用量与调用前上限预留，不能把一个计数器或未知费用说成完整财务限额。它也没有实现前文示意的通用 `no_progress` 去重；重复动作由有界预算终止。测试证明的是不会无限执行，不是模型能够自己发现原地打转。

`finish` 同样需要检查任务所需的证据与质量。对于 A30，文档未说明 virtual，构建成功也不能改变这个未知结论。循环到达完成分支与最终判断通过分别记录；一份结构有效的错误答案不能只因控制流正常退出就通过。

在当前实验包目录运行 `npm test`，检查实际动作白名单、预算停止、树形关联和正常结束。再按第 30 篇主动触发重复策略，查看运行报告与 trace，而不是只读测试名称。

## 业务恢复与观测不是同一份状态

`examples/atlas/execution.mjs` 中的早期 `runAgent` 保留为独立的控制面与恢复测试。它只开放 `build_status`、`ask`、`finish`，使用本地 `Trace` 记录器；其业务检查点保存 `nextStep`、累计工具次数、合成选择额度和绝对时间 `deadlineAt`。恢复不因传入更大的 `deadlineMs` 延长任务。`maxCostUnits` 是教学额度，不是货币。

新的 TypeScript SDK 循环已经实际记录选择、工具、步骤与停止，但没有从旧实现自动获得检查点恢复。`agent-compare` 的修正尝试是一项新执行，不是恢复前一轮，也不继承旧的写入确认。需要把两者连接时，应以受控业务状态为准，将 `taskId`、`attempt`、检查点引用及原截止时间作为关联信息，而不是从 trace 猜测哪些操作已完成。

下一篇继续用已经有恢复测试的业务实现说明中断边界；第 30 篇则复盘这条真正循环的 SDK 链路。两个验证目标互补，不把观测成功误报为恢复能力已经集成。

[上一篇：26 固定流程的分支越来越多，下一步该由谁决定](26-agent-decision.md) · [下一篇：28 任务中断以后，如何安全继续](28-recovery.md) · [返回学习目录](../README.md)
