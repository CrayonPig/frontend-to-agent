# 22–30 内容与示例核对记录

> 历史审阅记录：本文描述基线提交的实现，不代表后续观测实践已完成。修订缺口见[观测审计](observability-audit.md)，最新操作与状态见[详细大纲](../outline.md)和[验证记录](progress.md)。


核对日期：2026-10-26。本记录保留首轮正文的核对证据；第 30 篇随后补为真实 SDK/本地 HTTP 故障演练，新增记录见文末。正文设计、运行时切片与未验证外部能力分开，不将教学 mock 结果视为真实模型效果。

## 文件覆盖

| 篇号 | 正文 | 主要产出 | 实际代码与限制 |
| --- | --- | --- | --- |
| 22 | [实时工具](../05-tools/22-live-tools.md) | 查询意图、执行与实时证据闭环 | getBuildStatus 仅固定 AtlasTable 2.0；其他状态是设计要求 |
| 23 | [工具契约](../05-tools/23-tool-contract.md) | 参数、授权、结果与拒绝矩阵 | 实测额外参数与无权限拒绝；远端返回校验尚无集成 |
| 24 | [固定工作流](../05-tools/24-workflow.md) | 文档/状态分离的迁移工作流设计 | 运行时只覆盖构建查询切片；按钮构建未知 |
| 25 | [安全写入](../05-tools/25-safe-writes.md) | 预览、内容绑定、确认、幂等与待核对状态 | DraftStore 单进程沙箱；非数据库并发事务 |
| 26 | [Agent 决策](../06-agent/26-agent-decision.md) | 可推翻的引入假设与撤回条件 | 决策设计，不声称真实模型收益 |
| 27 | [受限循环](../06-agent/27-bounded-loop.md) | 状态反馈选择、工具执行、预算与 SDK 步骤树 | 新 TS 循环开放 read_docs/build_status/finish；脚本及 HTTP 选择器，无业务恢复集成 |
| 28 | [任务恢复](../06-agent/28-recovery.md) | 任务/消息/操作分离，检查点与再授权 | 文件快照、回执恢复；不保证多进程或断电原子性 |
| 29 | [公平比较](../06-agent/29-comparison.md) | 同任务、同预算与分层指标 | 文中 here-doc 实测；无真实模型成本/延迟结论 |
| 30 | [失败复盘](../06-agent/30-failure-review.md) | 重复工具耗尽预算 → step trace 定位 → 修正选择器；固定 A30 内容错误作对照 | 真实 TS 循环及 SDK，本地 script/HTTP mock；真实模型/平台未调用 |

## 实际执行

- 运行 22 篇的 getBuildStatus 命令：返回 build-demo-20、succeeded、2026-10-26T00:00:00Z、synthetic=true。
- 运行 29 篇 here-doc：workflowToolCalls=1、agentToolCalls=1、agentChoices=2、modelQualityMeasured=false。
- 运行 `node --test examples/atlas/test/*.test.mjs`：当次 40 个测试全部通过。包括预览消费、回执快照、恢复再授权、循环预算、A30 故障断言；这是该次核对的历史结果，最新测试数见整合验证记录。
- 这九篇每篇只有一个一级标题；相对 Markdown 导航指向存在文件。全站构建与最终导航结果见[整合验证记录](progress.md)。

## 合成资料与语义边界

AtlasButton 1.4 使用 loading，2.0 使用 pending，两者都不替代 disabled。C-T20 没有虚拟滚动/virtual 支持承诺。构建成功不新增组件能力证据；按钮构建无夹具时不得写成已成功。T-B20 不进入 reader-a 的材料，X-T20 仅 Q09，冲突卡仅 Q14。新增运行态夹具单独命名 atlas-runtime-01，不改变文档包。

Agent 示意动作目录比实际运行时更宽，正文已逐项说明。真实模型调用、远端状态服务、多进程事务、完整迁移工作流和模型语义评估未执行。真实费用未知，maxCostUnits 为教学选择额度，不是金额。脚本 choose 记 span，HTTP 选择器的实际请求记 generation；本地 HTTP mock 仍不是真实模型实测。质量判定与 completed/工具 succeeded 分离。

## 官方来源核对

[Anthropic：Building effective agents](https://www.anthropic.com/research/building-effective-agents)，核对于 2026-10-26。仅引用固定代码路径与模型动态选择的架构区分；页面提示工具生态已变化，因此不以其中 SDK 名称作为当前 API 依据。工具和状态类型为原创平台无关设计。第 27、30 篇修订使用独立 atlas-observability 包的锁定 SDK，通过本地 HTTP 模型/Prompt/观测替身演练；SDK 来源及接入核验由第 11–12 篇对应来源记录统一维护，未执行真实凭证或付费模型调用。

## 内容自审结论

九篇均从具体 Atlas 问题推进，带状态/代码/数据、失败分支与验收方式，未使用固定八标题模板；未虚构作者经历、模型实测、真实服务部署或生产可用保证。所有模拟代码与预期行为区分实际运行范围。未修改部署配置或许可证。

## 审阅后截止时间补强

第27–28篇与 runAgent 已统一为持久化绝对 deadlineAt，恢复不延长。新增过期恢复不调用选择器、恢复期间越过原截止时间与缺失/非法截止字段拒绝测试；最终结果见整合记录。

## 观测补齐修订

- 27 实际运行新的 TypeScript 受限循环：每轮状态反馈、选择、执行、更新，step/choose/tool/stop 均走 SDK。旧 runAgent 的持久化恢复测试仍独立保留，明确没有自动合并。
- 28 保留绝对 deadlineAt 与恢复再授权，说明 trace 关联信息不能取代业务检查点；新实验的 replay 不是旧任务恢复。
- 30 主线改为 agent-failure 与 agent-compare：重复工具预算终止、按 step 定位、修正选择器同题回归。原 failure/replay 固定 A30 保留为内容错误对照，区分动作选择失败与证据外断言。
- 默认故障/修复模型是按 Prompt 文字分支的 HTTP mock。v2 通过只证明实验链路与评分闭环，不证明真实 Prompt 质量收益；质量结果在 observation 与报告内，不冒称已经创建平台 Score。
- 原 40 项测试是首轮运行记录，不代表新观测包的测试数量；新包验证由最终集成记录列明。

### 固定 A30 内容对照的只读核验结果

已执行 30 篇真实 span 筛选与 replay 断言。故障 trace 的 7 个业务阶段均为同根子级，模型答案引用 Prompt v1；校验记录为 ERROR，规则指出 unsupported_parameter_claim、unsupported_text。故障重评分仍为 false，新执行 trace 使用 v2、quality.pass=true、同 task、attempt 增加。两次各有 8 个实际 SDK 导出 span。运行标识以读者当次产物为准，重新执行应生成新标识。

核验中曾发现 all 命令覆盖独立 failure/replay 报告、但 span 文件仍属于之前运行，导致严格 trace ID 断言失败。已交由 runtime 修复为 all 不覆盖专属产物；重新生成后断言通过。正文保留按 trace ID 精确关联的检查，不通过删过滤条件掩盖错配。未修改任何代码，未调用真实模型或平台。

### 受限 Agent 循环补齐与实际核验

父审指出固定 A30 工作流不能替代 Agent 执行链路后，27、30 已改为实际 TypeScript 循环为主线：每轮以当前状态和历史选择 read_docs/build_status/finish，执行器校验并回填；脚本选择记 span，实际 HTTP 选择请求记 generation。新循环带步骤、工具、合成选择额度与绝对时间预算，但没有业务检查点恢复。

已直接提取并执行 30 篇的三段只读断言，全部通过：

- agent-failure：stopReason=tool_budget，steps=3，toolCalls=2；第三个 agent.step 只有 agent.choose，没有第三个工具 observation。agent.task、step、choose/tool 与 task.stop 父子关系匹配同一 trace。
- agent-compare：重复策略仍被预算终止；evidence-first 读取 C-T20@r1、查询构建后完成，candidateAnswer 保留参数未知、构建成功，quality.pass=true；同 task、不同 trace、attempt 递增，resumeSupported=false。
- 固定内容对照 failure/replay：旧坏答案重新评分仍失败，v2 的独立回归通过；它与上面的动作选择失败分别定位。

另只读核对 agent-run 的本地 HTTP 选择器产物：3 次 agent.choose 均为 generation、2 次工具执行、最终质量通过。这验证真实 HTTP 请求与 SDK 输出路径，不证明真实模型质量；未执行真实平台或模型调用。本组不把临时 trace ID 写死，读者从当次报告取标识。新包完整自动测试数量和最终站点构建以整合记录为准。
