# 观测可选包实际验证记录

日期：2026-10-26。Node.js v24.19.0，npm 11.9.0。未另外在 Node 22 执行。没有真实账号、真实密钥、外部模型或真实 Langfuse 平台调用。

已运行并通过：

- `npm ci --cache <temporary-cache-directory>`：安装独立锁文件中的 75 包；原始结果 `install.txt`。
- `npm ls --depth=0`：固定版本与无无效 peer 状态，见 `dependencies.txt`；仅将绝对执行器目录规范化为 `<example-directory>`，包名/版本未改。
- `npm test`：包含 `tsc` 构建，18 项测试通过、0 失败（包括父级集成测试及子测试）；原始输出 `tests.txt`。
- `npm run seed-prompts`、`npm run demo -- all`、`npm run run -- --prompt-version 2`、`npm run compare`、`npm run failure`、`npm run replay`、`npm run promote -- --version 2 --confirm`、`npm run rollback -- --version 1 --confirm`：均在默认本地 HTTP 模式执行。
- `git diff --check`：通过。

HTTP 采集器收到的是实际 `LangfuseSpanProcessor` 导出的 OTLP JSON，不是手工伪造的 Trace 数组。正常一次 A30 包含 8 个 observation；compare 并发两次共 16 个；all 包括两版比较、fallback、越权提前拒绝、独立回归，共 36 个。各运行 report 中的 traceId 与同名 `*-spans.json` 匹配。all 只写 demo-report/all-spans，不覆盖独立 failure/replay/compare；跨 CLI 回归验证六个专属文件在运行 all 后逐字不变。

测试实际覆盖：

1. 真实 LangfuseClient 经 HTTP 创建/读取/编译两版 text Prompt，按版本和标签读取。
2. 同一 A30 两版返回故障/合格结果，用量与费用缺失保持 null。
3. 两并发 trace 各自根/子关系、SDK generation 关联真实 Prompt name/version、模型技术成功与质量失败分开。
4. mask 后完整 HTTP body 不含合成秘密 canary、认证值或隐藏来源；关闭自动资源检测后无命令行与工作区路径。
5. SDK PATCH 移动标签需确认及匹配报告，失败候选不得推广，内容 hash 不符拒绝。
6. 标签回退不改写旧版本内容，且不意味着质量批准。
7. 第二客户端缓存可滞后，禁用缓存重新读取时得到已移动标签。
8. SDK fallback 有本地 provenance，不带伪造远端 Prompt 关联。
9. 越权证据在工具和模型调用前停止，隐藏 ID/原文不导出。
10. 默认禁止外部端点、拒绝 URL 内凭证、截止时间，usage 仅接受非负安全整数；Prompt model/maxTokens 实际应用。
11. 采样 0 时不导出 span，业务结果仍可取得。
12. all 与每命令报告/采集证据不发生错配。

`failure` 的质量失败是预期观察，不是测试失败。规则仅针对这条合成 A30，不是通用语义裁判。HTTP 模型替身依据 Prompt 内容选择预设答案，因此对比不能证明真实模型收益。cost 与 usage 未知，不报告零费用或虚构 token 数。阶段 duration 来自本地这次执行，不能作为线上长尾结论。

未验证：真实 Langfuse UI/持久化/租户权限/保留删除、Docker 启动、任何付费模型、生产并发、真实平台 Prompt 缓存及标签一致性。新包包含固定 A30 工作流及独立 TS 受限 Agent，不是旧 `runAgent` 的自动埋点，也不提供任务检查点恢复。replay 只是读取保存答案重新评分，再执行新的 v2 任务；不重放模型私密推理。

最终配置摘要修正：对象键递归按字典序规范化后散列，数组顺序保留；已有配置测试增加重排键等价、嵌套重排等价、值变化不同、数组换序不同的断言。修改后重新执行 npm test（当时13项通过）及 all/compare/failure/replay/promote/rollback/run，全部报告按新hash重生成并核对trace配对。真实平台仍未运行。

新增受限 Agent 修订：最终 npm test 18 项通过（含父级测试）；tsc 通过。实际运行 agent-failure / agent-compare / agent-run --http-selector，得到 10 / 21 / 11 条 SDK observation，report 与各自 -spans/-otlp 配对。失败 stopReason=tool_budget、steps3/toolCalls2；修正策略 completed、quality.pass=true、steps3/toolCalls2；HTTP选择器同样通过。新增测试覆盖并发父子树、script span 与 HTTP generation 区分、四种预算停止、额外动作/答案字段拒绝、无工具证据的提前finish失败，以及实际模型HTTP输入仅含授权材料。完整OTLP（包括异常事件和状态）经过外部响应正文/header sentinel、错误JSON、secret URL、异常栈路径检查。真实外部平台/模型仍未调用；合成成本单位不是实际费用估计，Agent不具备持久化恢复。

最终发布边界回归：18项通过。新增测试逐项篡改Prompt名称、运行模式、运行模型和报告模型，验证在任何PATCH前拒绝；本地mock报告不能用于外部模型目标。另验证携带凭证的非回环HTTP在fetch前拒绝，HTTPS与精确回环HTTP允许。真实平台未运行；确认标志不代替证据匹配或生产审批。
