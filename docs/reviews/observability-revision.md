# 观测实践修订矩阵

修订基线为 `14ed77d4eff93799a41b4a1804dbde25d8958516`。核对日期：2026-10-26。此页说明相对[审计缺口](observability-audit.md)补了什么；实际命令结果见[验证记录](progress.md)。

| 范围 | 原缺口 | 修订交付 | 验收证据与边界 |
| --- | --- | --- | --- |
| 大纲与入口 | 仅章节标题，缺观测操作路线 | [详细大纲](../outline.md)：42篇操作/观察/验收、五组观测成果；README、顶部、侧栏、旧观测页交叉链接 | 42条规范路径逐一检查，构建后复核入口；不是把规划标成完成 |
| 10 | 概念未映射SDK实际字段 | [记录关系](../02-verifiable/10-trace-model.md)：trace/span/parent、task/session/attempt及报告字段 | 本地真实SDK导出两条并发trace，检查父子关系；无私密推理 |
| 11 | 合成generation、未发送SDK；Docker仅外链 | [接入步骤](../02-verifiable/11-langfuse.md)：完整Docker/已有项目、环境凭证、HTTP模型适配器、SDK生命周期与平台查验 | 锁定依赖、本地采集真实SDK；Docker与外部平台未运行 |
| 12 | 未实现函数片段与自定义Trace | [业务链路](../02-verifiable/12-instrumentation.md)：授权/召回/选择/工具/Prompt/模型/校验、异步、脱敏、采样 | 本地HTTP payload与关系断言；选择不是学习型重排；无通用PII保证 |
| 19 | 分层评测未连接SDK证据 | [RAG评测](../04-grounded/19-rag-evaluation.md)使用真实导出属性、候选与版本、分层结果 | A30单任务，不冒充原14题或生产样本 |
| 27–28 | 旧循环记录与外部观测边界不清 | [循环](../06-agent/27-bounded-loop.md)与[恢复](../06-agent/28-recovery.md)明确控制面、task/attempt与trace分离 | 旧循环44项基线保持；新增独立TS受限循环真实SDK观测，不声称自动继承旧runAgent的检查点恢复 |
| 30 | 文字复盘与孤立规则测试 | [故障演练](../06-agent/30-failure-review.md)：受限循环重复工具失败→逐step定位→修正选择器回归；另保留固定流程内容错误与旧答案重评分 | Agent专属报告与step/choose/tool/stop导出；脚本选择器用于确定性测试，HTTP选择器有真实调用路径；不证明真实模型提升 |
| 36/38 | 合成算例未连接新运行记录 | [延迟](../08-operations/36-latency.md)、[成本](../08-operations/38-cost.md)读取真实本地阶段时间、缺失用量/费用 | 本地HTTP耗时；费用null不是0，不给无依据模型收益 |
| 39 | PromptRegistry布尔门禁、未实现适配器 | [版本治理](../08-operations/39-prompt-versions.md)：真实客户端create/get/compile/update、配置应用、generation关联、compare/promote/rollback/fallback | 真实SDK到本地API测试；人工确认+报告核对；不是完整平台权限/审批系统 |
| 40–42 | 发布与交付范围没有新实践证据 | [发布](../08-operations/40-release.md)、[架构](../09-integration/41-architecture.md)、[验收](../09-integration/42-handoff.md)接入独立包与分层证据 | 模型/平台真实路径可执行但本次未运行，平台查询需读者环境 |

独立工程位于仓库 `examples/atlas-observability`，它不会替换默认演示服务，也没有把SDK依赖加入文档站根包。对外操作只由读者显式选择；本次实现与测试不创建账号、真实密钥、外部平台记录或付费调用。

## 不应混合的四份结论

1. **教程可操作**：步骤、源码、锁文件和故障定位命令齐备。
2. **本地协议与边界通过**：官方SDK确实序列化并发送到回环HTTP接收器，测试检查收到的内容。
3. **真实平台送达**：需要在目标Langfuse项目按同一trace ID查到记录；本轮未验证。
4. **真实模型质量**：需要代表性任务、重复运行及人工核对；本地脚本模型不提供这一证据。

不能把第二份结论称作第三或第四份。即便读者将模型和平台切成真实端点，默认A30一题也不足以支持整体质量与生产可用结论。
