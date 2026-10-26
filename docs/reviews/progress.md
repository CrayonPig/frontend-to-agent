# 全系列实施与验证记录

本记录区分正文完成、合成程序验证与外部集成验证，不把 mock 的结果当作真实模型质量。核验日期：2026-10-26。起始提交：`047b28108c97cde19066c26e04ad16b580bc8739`。此记录对应该版本之后的全系列扩展。

## 当前结果

42/42 正文已完成并经内容自审、运行库交叉核对。新增 03–42，01–02 保持原文与 URL。10 部分导航、16 个旧路径迁移入口、完整覆盖矩阵和官方版本来源已整合。本页保存本地验证证据；发布状态以对应提交的 GitHub Actions 记录为准。

| 范围 | 状态 | 证据 |
| --- | --- | --- |
| 01–42 全系列正文 | 通过（内容自审） | [逐篇覆盖矩阵](coverage.md)、四组审阅记录 |
| 合成运行示例 | 通过 | 最终 44 项测试：43 核心 + 1 Skill，0 失败 |
| Q01–Q14 规则基线 | 通过 | total=14、passed=14、dev=8、check=6；非模型准确率 |
| 导航、标题、大小写、本地链接 | 通过 | `npm run docs:check`，42 篇恰好连续编号 |
| 文档构建 | 通过 | `npm run docs:build`，VitePress 1.6.4，死链检查开启 |
| Langfuse 可选示例 | 通过（依赖/类型）；未验证（上报） | 固定包组合 npm ls + TypeScript strict 编译 |
| 真实模型、ES、MCP、Langfuse 服务 | 未验证 | 未创建账号、配置密钥或调用付费模型 |
| 浏览器交互、生产身份/事务/负载 | 未验证 | 本地 HTTP 已测，UI 时序人工验收步骤另列 |
| 远端发布状态 | 以工作流为准 | [GitHub Actions](https://github.com/CrayonPig/frontend-to-agent/actions) |

## 最终命令与原始证据

环境：Node.js v24.19.0、npm 11.9.0；要求 Node 22+，未额外声称在 Node 22 执行。以下均已实际运行：

```bash
npm ci
npm run docs:check
npm test
node examples/atlas/evaluate.mjs
npm run docs:build
git diff --check
```

安装时通过 `--cache` 指定了可写临时缓存目录；未改变 package-lock.json 或新增项目依赖。`npm test` 原始输出为 [integration-tests.log](https://github.com/CrayonPig/frontend-to-agent/blob/main/examples/atlas/reports/integration-tests.log)，核心 TAP 历史输出与 [baseline.json](https://github.com/CrayonPig/frontend-to-agent/blob/main/examples/atlas/reports/baseline.json) 一并保留；[示例验证说明](https://github.com/CrayonPig/frontend-to-agent/blob/main/examples/atlas/reports/verification.md)逐项说明范围。

第 22/29/31/32/36/37/38/39 篇可运行命令已执行，结果见各组审阅记录。第 16 篇余弦算例已计算；第 11 篇完整外部上报示例只编译、不上报。源码节选和设计伪代码均按正文标示，不归入已运行完整程序。

## 跨章边界验收

| 检查 | 状态 | 证据与限制 |
| --- | --- | --- |
| 过滤、引用、上下文、缓存、观测授权一致 | 通过 | 候选先授权；隐藏 ID/修订拒绝；权限变化失效；不证明全攻击面安全 |
| 更新与删除退出旧知识 | 通过 | 单调修订、墓碑、旧事件拒绝、缓存代次、事实更新回归 |
| 确认、幂等与恢复 | 通过 | 主体/权限修订/摘要/期限绑定，同预览防重复，回执快照恢复；非分布式事务 |
| Agent 预算与终止 | 通过 | 步数、工具、跨恢复绝对截止时间、合成成本额度、非法动作；非真实费用上限验证 |
| Trace 与业务状态分离 | 通过 | 业务检查点独立；恢复再授权；trace 记录实际候选与停止原因 |
| 内容结果与技术成功分离 | 通过 | 错版本、无依据 virtual、冲突、拒答泄漏负例；规则非通用语义判断器 |
| 可选外部与本地能力不混报 | 通过（文档自审） | 架构图区分 HTTP 默认路径、独立模块、外部可选适配 |

## 共同数据契约

原始 `atlas-fixture-01` 与 Q01–Q14 保持含义。Atlas UI 1.4 按钮使用 loading，2.0 使用 pending，二者均由 disabled 阻止 click；AtlasTable 2.0 虚拟滚动和数据量上限未知。Q14 仅使用两份互相冲突的参数说明替换 C-T20；X-T20 只在 Q09 加入。T-B20 是作者测试夹具，不进入 reader-a 可见上下文、引用或缓存。

任务结果保留六类：answered、insufficient_evidence、needs_clarification、forbidden、conflicting_evidence、execution_unavailable。执行器、传输和恢复状态独立，不用模型输出替代授权或回执。后续新增实时状态、沙箱草稿、记忆等数据需显式声明是教学扩展。

## 验证分类

- **通过**：有实际检查命令或可复核文件证据。
- **失败**：已执行检查且结果不满足约定，须保留原因。
- **未验证**：未运行真实供应商、Elasticsearch、Langfuse、MCP 或生产部署等可选路径。
- **不适用**：概念或决策产物没有对应外部执行；以推理与人工审阅验收。

正文里的预期输出、模拟数据及人工示例不得写成实测统计。最终报告会记录实际命令与覆盖限制。

## 验证过程中发现并修复的问题

- 导航检查最初把代码围栏中的示例标题计为文章标题；检查器已修正为忽略围栏内容。
- 报告尚未齐备时，构建检测到来源页链接缺失；补齐后复验通过，没有关闭死链检查。
- 沙箱同一预览曾可用不同幂等键重复消费；现已拒绝并有回归测试。
- 恢复最初按尝试重置时间预算；现将 `deadlineAt` 随检查点持久化。新增过期恢复不再选择、恢复期间超过原截止时间及非法截止字段测试。

最终 `npm test` 为44项通过（43核心+1 Skill），0失败；链接/标题检查、构建与diff检查通过。早期单项报告保留当时测试数；最新结果以本页和 integration-tests.log 为准。
