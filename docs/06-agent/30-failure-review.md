# 30 复盘一次失败的 Agent 任务

用户问：“AtlasTable 2.0 有 virtual 参数吗？演示构建通过了吗？”一次受限 Agent 执行中，选择器反复要求查询构建。工具每次都返回成功，但助手始终没有读取组件文档，也没有给出最终回答，最后耗尽工具预算。

这不是“答案写得不好”，而是下一步动作没有随着已有结果改变。另一种失败则相反：系统读了文档、查了构建，却写出“构建成功，所以支持 virtual”。本篇先实际制造循环失败，再用固定 A30 路径作为内容错误对照。两种错误需要不同证据，不能都归结为“模型幻觉”。

## 让一个真实循环主动失败

实验使用 `examples/atlas-observability` 的 TypeScript 受限循环。每轮选择器接收当前状态与历史，返回 `read_docs`、`build_status` 或 `finish`；执行器校验、调用工具、更新状态，再进入下一轮。默认 `repeat-build` 故障策略无视已有结果，一直选择只读构建查询。它不是固定工作流的 span 改名，循环确实会根据选择结果决定执行什么，并在预算处拦截下一次动作。

先从仓库根目录执行：

```bash
cd examples/atlas-observability
npm ci
npm run build
npm run seed-prompts
npm run agent-failure
```

默认选择器是故意写坏的脚本，模型与平台都不需要真实账号；观测使用真实 SDK，通过 HTTP 发到本地接收端。它稳定制造错误，以便检查控制与观测边界，不估计真实模型犯错概率。本地 HTTP 接收到 OTLP 也不等于真实 Langfuse 项目已经入库。

任务仍使用 `atlas-fixture-01` 中的 C-T20@r1 和固定构建 `build-demo-20`。文档没有定义 virtual，构建状态为 succeeded。完成任务必须分别表达参数未知与构建成功，不能把一个工具成功当作完成全部问题。

故障报告写入 `reports/agent-failure.json`，实际导出记录写入 `reports/agent-failure-spans.json`。先读自己的记录：

```bash
node --input-type=module <<'JS'
import { readFile } from 'node:fs/promises'
console.log(JSON.stringify(JSON.parse(
  await readFile('reports/agent-failure.json', 'utf8')
), null, 2))
JS
```

观察 `taskId`、`attempt`、`policy`、`steps`、`toolCalls` 和 `stopReason`。默认故障运行应为 `repeat-build`、3 次选择、2 次工具执行，最终 `tool_budget`；`candidateAnswer` 与 `quality` 均为 null，因为它尚未生成可评分的最终答案。这里不能把“没有评分”写成“答案事实检查通过”，更不能伪造一份成功答案。命令正常退出只能说明演练命令运行完成；业务任务是否完成要看报告中的停止结果。

## 沿步骤找到“没有推进”的证据

根 observation 为 `agent.task`，每轮有 `agent.step`。同一轮的 `agent.choose` 与执行动作在这个 step 下；根下另有 `task.stop` 记录终止。脚本选择器记为 span；经 HTTP 实际请求选择模型时，选择调用才记为 generation。

从报告中的实际 trace ID 找到同次运行的树，核对第三次选择被拦截。以下命令使用锁定 SDK 解析出的实际字段，默认采样率为 1：

```bash
node --input-type=module <<'JS'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const read = async path => JSON.parse(await readFile(path, 'utf8'))
const run = await read('reports/agent-failure.json')
const spans = (await read('reports/agent-failure-spans.json'))
  .filter(span => span.traceId === run.traceId)
assert.equal(run.stopReason, 'tool_budget')
assert.equal(run.steps, 3)
assert.equal(run.toolCalls, 2)
assert.equal(run.candidateAnswer, null)
const root = spans.find(span => span.name === 'agent.task')
assert.ok(root)
const steps = spans.filter(span => span.name === 'agent.step')
  .sort((a, b) => Number(a.attributes['langfuse.observation.metadata.step'])
    - Number(b.attributes['langfuse.observation.metadata.step']))
assert.equal(steps.length, 3)
for (const step of steps) {
  assert.equal(step.parentSpanId, root.spanId)
  const children = spans.filter(span => span.parentSpanId === step.spanId)
  assert.equal(children.filter(span => span.name === 'agent.choose').length, 1)
  console.log({ step: step.attributes['langfuse.observation.metadata.step'],
    children: children.map(span => ({ name: span.name,
      output: span.attributes['langfuse.observation.output'] })) })
}
assert.equal(spans.filter(span => span.name === 'tool.build_status').length, 2)
assert.ok(!spans.some(span => span.parentSpanId === steps[2].spanId
  && span.name.startsWith('tool.')))
const stop = spans.find(span => span.name === 'task.stop')
assert.equal(stop.parentSpanId, root.spanId)
assert.equal(JSON.parse(stop.attributes['langfuse.observation.output']).stopReason,
  'tool_budget')
console.log('第三次选择留下记录，但第三次工具调用没有执行')
JS
```

不要只数工具名出现了几次。第三轮可能记录了“想再查一次”的选择，但预算检查必须在调用前拦截。判断是否发生了真实工具调用，要看对应 step 有没有工具 observation、状态计数是否增加。日志里有意图不等于工具执行，有工具执行成功也不等于任务有进展。

从这条链路能作出有限但明确的结论：授权没有拒绝这项只读查询；状态服务返回了指定组件与版本的合成成功记录；选择器没有利用已有结果去补缺少的文档证据；执行器最终按预算停止。因此要修的是选择策略，而不是把工具超时调大、增加重试次数，或者删除预算让它“再想一会儿”。

trace 不会告诉我们模型的私密推理，也不需要它来证明这里的外部行为。若实际换成模型选择器，仍然先检查它收到的状态、返回动作和执行结果；不能因为动作不合理就编造一段模型心理活动作为根因。

## 修正策略，重新运行同一个问题

正常策略 `evidence-first` 使用已有状态：缺少文档就读取授权文档，缺少构建就查询构建，两类证据齐全再结束。它的依据是下一轮能看到上轮结果，而不是预先跑完固定工具列表再让模型总结。

执行同题比较：

```bash
npm run agent-compare
```

报告写入 `reports/agent-compare.json`，这次的实际导出在 `reports/agent-compare-spans.json`。比较包含故障策略与修正策略各一次执行；两边使用同一 A30 问题、身份与合成资料。修正执行必须有自己的 trace，不能把故障运行最后一个 span 改成成功。

对报告与两条实际 trace 一起做检查：

```bash
node --input-type=module <<'JS'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const read = async path => JSON.parse(await readFile(path, 'utf8'))
const { runs: [failed, corrected] } = await read('reports/agent-compare.json')
const spans = await read('reports/agent-compare-spans.json')
assert.equal(failed.stopReason, 'tool_budget')
assert.equal(corrected.stopReason, 'completed')
assert.equal(corrected.quality.pass, true)
assert.equal(corrected.candidateAnswer.parameterResult, 'insufficient_evidence')
assert.equal(corrected.candidateAnswer.buildStatus, 'succeeded')
assert.equal(corrected.toolCalls, 2)
assert.equal(corrected.steps, 3)
assert.equal(corrected.taskId, failed.taskId)
assert.equal(corrected.attempt, failed.attempt + 1)
assert.notEqual(corrected.traceId, failed.traceId)
assert.equal(corrected.resumeSupported, false)
const repaired = spans.filter(span => span.traceId === corrected.traceId)
for (const name of ['agent.task', 'tool.read_docs', 'tool.build_status',
  'answer.validate', 'task.stop']) assert.ok(repaired.some(span => span.name === name))
assert.deepEqual(corrected.sourceRevisions, ['C-T20@r1'])
console.log({ previousStop: failed.stopReason, repairedStop: corrected.stopReason,
  actions: corrected.history.map(item => item.action),
  verdict: corrected.quality })
JS
```

合格结果是：故障执行在预算处停止；修正执行读取了 C-T20，查到构建结果，然后提交保留参数未知的答案，并通过这个任务的有限评分规则。还要检查结束前确实有必要证据，防止一个总是输出合格模板的选择器绕过工具使用。

编写时已执行本篇三段只读断言，实际产物符合预期：故障第三步只有选择记录，没有第三次工具执行；修正策略完成 read_docs 与 build_status 后结束，质量规则通过。另核对本地 HTTP 选择器运行，三次 agent.choose 均以 generation 导出；未调用真实模型。

默认修正策略是脚本，所以对比证明的是状态反馈、动作派发、边界、评分与 SDK 记录形成闭环，不是“真实 Agent 的成功率已经提高”。不要从一题脚本结果推断模型能力、延迟分位数或费用收益。

需要检查选择器的真实 HTTP 接口时，运行：

```bash
npm run agent-compare -- --http-selector
```

默认仍访问本地 HTTP mock。模型输入包含当前状态和允许动作，模型响应必须被解析成受限动作，不能直通任意函数名或网址。真实模型与真实平台的可选配置沿[第 11 篇](../02-verifiable/11-langfuse.md)及实验包 README；本教程编写验证不调用付费服务，也不把本地 mock 的 generation 误称为真实供应商测试。

## 对照：动作都完成，答案仍然可以失败

保留固定 A30 路径，可以把动作选择错误与内容错误分开。它按确定顺序授权、读文档、选证据、查构建、生成并校验；v1 下的 HTTP mock 故意回答“构建成功，因此支持 virtual”。这次没有循环失控，问题出在回答超出了证据。

```bash
npm run failure
npm run replay
```

`failure` 产生 `reports/failure.json` 与 `reports/failure-spans.json`。根为 `assistant.task`，七个直接子阶段依次为 `authorize`、`retrieve.docs`、`select.evidence`、`tool.build_status`、`prompt.resolve`、`model.answer`、`answer.validate`。检索记录包含 C-T20@r1；工具输出 succeeded；生成 observation 的 `langfuse.observation.prompt.version` 为 1，输出却新增了无依据断言；校验输出为 `pass: false`。

这里的修复版本 v2 明确分开两项承诺：文档未知继续保留未知，工具成功只用于回答构建状态。`replay` 先重新评分旧候选，不调用模型；再使用 v2 发起一次独立的同题执行。检查：

```bash
node --input-type=module <<'JS'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const read = async path => JSON.parse(await readFile(path, 'utf8'))
const old = await read('reports/failure.json')
const report = await read('reports/replay.json')
assert.equal(report.recordedReplay.sourceRunId, old.runId)
assert.equal(report.recordedReplay.traceId, old.traceId)
assert.equal(report.recordedReplay.externalCalls, 0)
assert.equal(report.recordedReplay.quality.pass, false)
assert.equal(report.regression.prompt.version, 2)
assert.equal(report.regression.quality.pass, true)
assert.equal(report.regression.taskId, old.taskId)
assert.equal(report.regression.attempt, old.attempt + 1)
assert.notEqual(report.regression.traceId, old.traceId)
console.log('旧内容失败仍被发现，修正版本的独立回归通过')
JS
```

默认模型按 Prompt 文字返回预置坏答案或合格答案。因此，这个对照验证版本选择、记录和评分，不证明一句 Prompt 已让真实模型变可靠。评分规则需要同时拒绝错误断言、接受合理未知，而不是简单检查有没有 virtual 这个单词。

## 留下能再次验证的修复证据

两条演练都应保留输入与版本、实际候选或动作、来源修订、工具结果、停止原因及评价规则。质量结果目前放在 observation 与运行报告中，不冒称已经创建 Langfuse 的独立 Score 对象。`langfuse.observation.level`、OTLP `status.code` 与业务质量也不能互相替代。

如果按报告中的 trace ID 找不到对应根节点，先检查报告与 span 文件是否来自同一次命令、导出是否完成。不要删掉 trace 过滤，拿另一条同名 observation 凑成一棵完整树。SDK 导出数组的顺序不保证是业务开始顺序，要用父子关系与步骤标识读取。

`agent-compare` 的第二次尝试与 `replay` 的新执行，都不是第 28 篇的检查点恢复。它们不会沿旧 nextStep 继续，不继承已确认写入，也不能延长旧任务的绝对截止时间。真正恢复仍从受控业务状态读取检查点并重新授权；新 SDK 循环目前没有自动集成那套恢复实现。

在当前包目录运行 `npm test`，复验选择白名单、预算、父子关系、内容规则和导出边界。真实模型接入后还应在相同任务集上重复运行，保留 Agent 更差的案例；一次脚本通过只能作为控制回归。运行记录不采集模型私密推理，真实输入与工具材料按最小化、脱敏、限权和保留期处理。

本次复盘的结束条件是能区分并复现两种失败：一种没有把任务往前推进，另一种在已有证据之外作出承诺。修正分别落到选择策略和答案契约，再用原题验证，而不是以工具成功或漂亮 trace 代替任务完成。

[上一篇：29 和固定工作流做一次公平对比](29-comparison.md) · [返回学习目录](../README.md)
