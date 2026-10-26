# 24 固定流程能完成的任务，先不要交给 Agent

用户想把 AtlasButton 从 1.4 迁到 2.0，希望助手先解释参数变化，再确认演示构建状态。当前运行时只有 AtlasTable 2.0 的构建夹具，因此这个按钮迁移场景中的构建状态应保留为无法确认；下面先用它讨论完整流程设计，再区分实际可运行切片。这个任务有几个步骤，但步骤多不意味着需要模型自己规划。目标版本已知，文档范围已知，实时状态只有一个查询入口；把顺序写清楚，通常比增加一个“请决定下一步”的调用更容易验证。

本篇把这条路径写成固定工作流：找组件、确认版本、读取证据、查询状态、组织建议。模型仍可负责理解问题或生成措辞，但不能自行跳过权限检查，也不能把资料缺失变成默认成功。

## 先明确每一步带来的新事实

组件名称与版本只是查询条件，不是结论。读取 `C-B14` 和 `C-B20` 后，才能确认 1.4 的 `loading` 在 2.0 被 `pending` 替代，`disabled` 仍负责阻止点击。查询构建后，才能描述合成状态服务返回的记录。最后组织迁移建议时，需要把这两类事实分开：文档解释参数；构建状态说明某个观察时刻的运行记录。

如果用户没有提供起始版本，流程先要求补充；如果目标版本文档不存在，不能继续编写具体迁移步骤。状态服务不可用时，不必抹掉已确认的参数差异，但必须把构建状态标成未知。一个总的 `success` 布尔值表达不了这些组合。

可以用明确的阶段记录代替模糊的“处理中”：

```text
received
  → needs_clarification
  或 → evidence_checked
       → evidence_missing / evidence_conflict
       或 → status_checked
            → recommendation_ready（标明状态已知或未知）
```

这里没有“模型说完成了就完成”的箭头。每次迁移都需要满足上一阶段的约束。固定流程的价值不是绝不调用模型，而是让应用决定哪些动作必须出现、何时允许进入下一阶段。

## 把结果组合，而不是串接几句文本

下面是 TypeScript 工作流示意，依赖函数代表执行端边界，并非可直接复制运行的完整模块：

```ts
async function prepareMigration(input: MigrationInput, ctx: TrustedContext) {
  const scope = requireVersions(input)
  if (!scope.ok) return { kind: 'needs_clarification', question: scope.question }

  const evidence = await readAuthorizedEvidence(ctx, scope.value)
  if (evidence.kind !== 'supported') return evidence

  const build = await executeBuildStatus(ctx, {
    component: scope.value.component,
    version: scope.value.toVersion
  })

  return {
    kind: 'recommendation',
    changes: evidence.changes,
    sourceIds: evidence.sourceIds,
    build: build.kind === 'ok' ? build.result : { kind: 'unknown' },
    execution: 'not_requested'
  }
}
```

把 `changes` 与 `build` 分开保存，是为了防止后续模板把“构建成功”改写成“迁移保证没有风险”。建议内容也不是执行计划的授权。这里的 `execution: 'not_requested'` 明确表示没有修改仓库、保存草稿或调用 `share`。

证据读取函数必须先做权限过滤；`readAuthorizedEvidence` 的名字不是实现保证，需要测试证明无权材料不会进入结果。`requireVersions` 也不能只检查字符串非空：`1.8` 虽然格式像版本号，在当前资料包中仍然没有对应按钮事实。

## 工作流能重放什么

前端状态机常通过固定事件序列复现界面问题。这里也可以保存合成输入、文档修订、状态夹具版本以及执行器版本，再把这些相同输入交回确定流程，检查阶段顺序和输出分类。

但“可重放”有范围。如果其中一个步骤使用真实模型，重新调用不保证生成逐字相同的答案；如果查询真实构建服务，状态也会变化。为了定位编排错误，可以重放已经保存的脱敏工具结果，验证状态迁移；要评估模型质量，则需要另做重复调用并记录差异。两者不应共用一个“完全复现”标签。

观测上，一次流程有一个 trace；`retrieve.docs`、`evidence.check`、`tool.build_status` 与 `answer.compose` 是各步骤的 observation。跳过某步时留下原因，如 `missing_target_version`，不能凭空创建一次看似执行过的模型调用。给阶段计时能看出等待在哪里，但链路没有错误不能证明建议正确。

## 分支增加时，先看是哪种复杂度

添加一个“构建失败则提示人工检查”的分支，仍然很适合确定代码。添加五种用户措辞，通常是输入理解问题，不必把后续整个流程交给模型。只有当需要哪些资料、是否继续比较以及下一步问题依赖前一步结果，而且路径难以事先列全时，才值得讨论动态决策。

一个常见误判是把长函数看作引入 Agent 的理由。长函数可能只说明职责没有拆分：验证输入、读取证据、执行查询、呈现结果可以各自独立。把混乱代码换成模型循环，不会自动让权限和错误恢复变清楚。

## 用五条路径检查编排

准备：版本明确且资料充分、缺少目标版本、目标版本无资料、同版本资料冲突、状态查询不可用。对每条路径，写下允许经过的阶段与禁止发生的动作。

其中“缺少目标版本”不应调用状态工具；“资料冲突”不应形成确定迁移参数；“状态不可用”可以返回有证据的参数建议，但不能说构建已通过。让一个故障注入适配器统计调用次数，能检出“虽然最后拒答，中间仍查了不该查的数据”这种隐藏失败。

仓库实际实现的 `runWorkflow` 位于 `examples/atlas/execution.mjs`，只覆盖 AtlasTable 2.0 的“确认版本 → 查固定构建 → 返回结果”，以及缺少版本时停止；它没有实现上面 `prepareMigration` 的文档比较与五条分支。运行 `node --test examples/atlas/test/*.test.mjs` 可验证这个较小切片；第 29 篇会用同一切片与脚本循环对比。这里保留完整流程示意，是为了说明扩展时每一步的职责，不能把示意分支都计入实际覆盖。

验收不是所有路径都走到最后，而是每条路径都在合适的边界停止，并给用户一个有依据的下一步。等这条固定流程成为稳定基线，再讨论开放选择权，才有实际的比较对象。

[上一篇：23 工具描述是给模型看的，执行校验是给系统做的](23-tool-contract.md) · [下一篇：25 从只读到写操作：预览、确认与幂等](25-safe-writes.md) · [返回学习目录](../README.md)
