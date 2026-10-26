# 22–30 内容与示例核对记录

核对日期：2026-10-26。本记录区分正文设计、运行时切片与未验证外部能力，不将教学 mock 结果视为真实模型效果。

## 文件覆盖

| 篇号 | 正文 | 主要产出 | 实际代码与限制 |
| --- | --- | --- | --- |
| 22 | [实时工具](../05-tools/22-live-tools.md) | 查询意图、执行与实时证据闭环 | getBuildStatus 仅固定 AtlasTable 2.0；其他状态是设计要求 |
| 23 | [工具契约](../05-tools/23-tool-contract.md) | 参数、授权、结果与拒绝矩阵 | 实测额外参数与无权限拒绝；远端返回校验尚无集成 |
| 24 | [固定工作流](../05-tools/24-workflow.md) | 文档/状态分离的迁移工作流设计 | 运行时只覆盖构建查询切片；按钮构建未知 |
| 25 | [安全写入](../05-tools/25-safe-writes.md) | 预览、内容绑定、确认、幂等与待核对状态 | DraftStore 单进程沙箱；非数据库并发事务 |
| 26 | [Agent 决策](../06-agent/26-agent-decision.md) | 可推翻的引入假设与撤回条件 | 决策设计，不声称真实模型收益 |
| 27 | [受限循环](../06-agent/27-bounded-loop.md) | 选择、执行、预算与停止控制 | 脚本选择器；build_status/ask/finish；非完整检索 Agent |
| 28 | [任务恢复](../06-agent/28-recovery.md) | 任务/消息/操作分离，检查点与再授权 | 文件快照、回执恢复；不保证多进程或断电原子性 |
| 29 | [公平比较](../06-agent/29-comparison.md) | 同任务、同预算与分层指标 | 文中 here-doc 实测；无真实模型成本/延迟结论 |
| 30 | [失败复盘](../06-agent/30-failure-review.md) | 未知参数与成功构建不能互相证明 | A30 规则组合回归；非自然语言通用判定器 |

## 实际执行

- 运行 22 篇的 getBuildStatus 命令：返回 build-demo-20、succeeded、2026-10-26T00:00:00Z、synthetic=true。
- 运行 29 篇 here-doc：workflowToolCalls=1、agentToolCalls=1、agentChoices=2、modelQualityMeasured=false。
- 运行 `node --test examples/atlas/test/*.test.mjs`：当次 40 个测试全部通过。包括预览消费、回执快照、恢复再授权、循环预算、A30 故障断言；这是该次核对的历史结果，最新测试数见整合验证记录。
- 这九篇每篇只有一个一级标题；相对 Markdown 导航指向存在文件。全站构建与最终导航结果见[整合验证记录](progress.md)。

## 合成资料与语义边界

AtlasButton 1.4 使用 loading，2.0 使用 pending，两者都不替代 disabled。C-T20 没有虚拟滚动/virtual 支持承诺。构建成功不新增组件能力证据；按钮构建无夹具时不得写成已成功。T-B20 不进入 reader-a 的材料，X-T20 仅 Q09，冲突卡仅 Q14。新增运行态夹具单独命名 atlas-runtime-01，不改变文档包。

Agent 示意动作目录比实际运行时更宽，正文已逐项说明。真实模型调用、远端状态服务、多进程事务、完整迁移工作流和模型语义评估未执行。真实费用未知，maxCostUnits 为教学选择额度，不是金额。实际脚本 choose 记 span，而非模型 generation；质量判定与 completed/工具 succeeded 分离。

## 官方来源核对

[Anthropic：Building effective agents](https://www.anthropic.com/research/building-effective-agents)，核对于 2026-10-26。仅引用固定代码路径与模型动态选择的架构区分；页面提示工具生态已变化，因此不以其中 SDK 名称作为当前 API 依据。22–30 的工具和状态类型为原创平台无关设计，没有外部 SDK 请求代码，不涉及需配置真实凭证的供应商调用。

## 内容自审结论

九篇均从具体 Atlas 问题推进，带状态/代码/数据、失败分支与验收方式，未使用固定八标题模板；未虚构作者经历、模型实测、真实服务部署或生产可用保证。所有模拟代码与预期行为区分实际运行范围。未修改部署配置或许可证。

## 审阅后截止时间补强

第27–28篇与 runAgent 已统一为持久化绝对 deadlineAt，恢复不延长。新增过期恢复不调用选择器、恢复期间越过原截止时间与缺失/非法截止字段拒绝测试；最终结果见整合记录。
