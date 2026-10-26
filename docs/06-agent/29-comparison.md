# 29 和固定工作流做一次公平对比

受限循环已经能运行，下一步不应该是增加更多工具，而是回答一个更具体的问题：同样的 Atlas 任务，开放选择权究竟换来了什么？如果固定流程一次就能查到状态，Agent 多走两轮才给出同样答案，工具调用次数增加不是能力提升。

本篇建立可复用的比较方法。先用 mock 验证比较器是否正确，再说明接真实模型时还需要采集什么。课程中的确定性脚本不会证明真实模型成功率，也不会产生可信的模型延迟或费用结论。

## 先对齐任务，再对齐资源

比较双方必须看到相同的用户问题、身份、文档修订和状态快照。固定流程不能使用答案标签，Agent 也不能多看私有资料。允许的工具、超时预算和最终判定规则应一致，否则结果可能只反映资源不同。

题集至少分三组：路径明确的版本查询、需要澄清的信息缺口、资料不足或权限拒绝的终止任务。第三组不可省略。一个系统在所有问题上都输出答案，表面完成率可能很高，却恰好绕过了最重要的边界。

比较单位是一项用户任务，而不是一次模型请求。连续追问才得到正确答案，应算入同一次任务的调用、耗时与成本；达到预算后交给人工也需要记录，不能从分母中删除。期望拒答的任务按规则拒答可以通过，不能因为没有给出参数就记失败。

## 最小比较先观察动作差异

仓库的 `runWorkflow` 只实现“确认版本 → 查询合成构建 → 组织结果”的切片；`runAgent` 使用注入的脚本选择器，还不是一个真实模型策略。下面命令从仓库根目录运行，比较同一个 AtlasTable 2.0 状态任务：

```bash
node --input-type=module <<'JS'
import assert from 'node:assert/strict'
import { principal } from './examples/atlas/fixtures.mjs'
import { runWorkflow, runAgent } from './examples/atlas/execution.mjs'

const request = { component: 'AtlasTable', version: '2.0' }
const workflow = runWorkflow(principal, request)
const agent = await runAgent({
  principal,
  taskId: 'compare-build-01',
  choose: state => state.observations.length === 0
    ? { type: 'build_status', args: request }
    : { type: 'finish', answer: 'build-demo-20: succeeded' }
})
assert.equal(workflow.build.status, 'succeeded')
assert.equal(agent.observations[0].result.status, 'succeeded')
assert.equal(agent.toolCalls, 1)
console.log({
  workflowToolCalls: workflow.steps.filter(x => x === 'build_status').length,
  agentToolCalls: agent.toolCalls,
  agentChoices: agent.nextStep,
  modelQualityMeasured: false
})
JS
```

本教程编写时已在合成运行时执行上述命令：两边均调用一次工具，脚本循环做两次选择，`modelQualityMeasured` 为 `false`。这只能验证动作记录与比较口径，没有证明 Agent 更聪明。`completed` 也只是循环终态；比较器仍要核对是否回答指定组件与版本、是否用到了实际工具结果。

把脚本改成永远选择 `build_status`，循环会在工具或步骤预算处停止。固定流程仍能正常返回；这个失败样例值得保留，因为它展示了开放选择权可能带来的退化。不能只挑一个恰好顺利的脚本来宣称架构收益。

## 一张比较表要分开几类指标

真正接入模型后，每个任务记录任务通过与否、越权尝试及实际泄露、工具选择是否必要、参数是否正确、总耗时、调用量、已知费用与人工接管。安全指标独立列出，不用较高平均成功率抵消某一次越权。

| 维度 | 判断问题 | 容易误读的替代指标 |
| --- | --- | --- |
| 任务质量 | 版本、事实、引用与不足说明是否符合预期 | 回答长度、措辞流畅 |
| 动作正确 | 该调用是否必要、参数是否匹配任务 | 工具调用越多越好 |
| 资源消耗 | 一个任务累计花了多少 | 单次调用价格 |
| 操作边界 | 是否执行了禁止动作 | 只有 HTTP 错误才算失败 |
| 人工接管 | 何时需要人继续，带来了多少工作 | 转人工就从统计中删除 |

对同一题目可重复多次，保留每一次结果，而不是只取最好一次。确定性 mock 的重复运行主要用于回归控制逻辑，不能代表真实模型波动；真实模型比较还需要固定配置、记录实际版本及请求条件。耗时数据应注明时间窗、样本量与测量范围，少量样本不适合包装成稳定 p95。

## 用证据决定保留、收缩或撤回

如果 Agent 只在需要多次收集信息的任务上有收益，就按任务入口选择它，明确版本的查询继续走固定流程。如果它主要浪费在重复检索上，先收缩允许动作和停止条件，再做相同题集回归。若收益不足以覆盖额外耗时、费用与维护成本，撤回自主选择也是完整的实验结论。

不要把某次工具参数失败都归因于模型。工具描述模糊、返回值缺乏必要字段、状态信息没有进入下一轮，也会造成选择错误。比较报告应能回到 trace 检查具体动作，修复后再运行；trace 解释发生了什么，评分规则决定是否变好。

实践产出是一份带版本的比较记录：任务集合、两种策略、允许动作与预算、逐题结果、已知限制以及最终决定。未接真实模型时，结论应明确写“控制逻辑对比完成，真实策略收益待验证”，而不是用 mock 的全通过替代质量证据。

[上一篇：28 任务中断以后，如何安全继续](28-recovery.md) · [下一篇：30 复盘一次失败的 Agent 任务](30-failure-review.md) · [返回学习目录](../README.md)
