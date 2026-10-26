# 第 36–40 篇观测与 Prompt 实践核验

核对日期：2026-10-26。本次修订将第 39 篇从内存布尔门禁升级为 `examples/atlas-observability` 的真实 SDK + 本地 HTTP 实验，并让第 36、38、40 篇使用同一份任务报告。没有创建账号、配置真实密钥或调用外部付费模型。

## 采用的版本与核验方式

独立 TypeScript 示例固定 `@langfuse/client`、`@langfuse/tracing`、`@langfuse/otel` 为 6.0.2；Node.js 22+、OpenTelemetry 兼容组合与锁文件由第 11 篇及示例 `package-lock.json` 定义。本次直接读取已安装的 6.0.2 类型声明与发布代码，并重新查阅官方文档；不混用旧单包 SDK、Python 方法或不同代际的初始化代码。

| 核验点 | 官方一手来源 | 应用中的对应责任 |
| --- | --- | --- |
| Prompt 创建、按名称产生版本 | [官方入门](https://langfuse.com/docs/prompt-management/get-started) | `seed-prompts` 使用 `prompt.create`，既有内容不覆盖 |
| 版本与标签读取、标签移动 | [版本控制](https://langfuse.com/docs/prompt-management/features/prompt-version-control) | `get` 明确使用 version 或 label，推广用 `update({name,version,newLabels})` 并读回 |
| config 随模板版本保存 | [Prompt Config](https://langfuse.com/docs/prompt-management/features/config) | `config` 为未知输入，应用校验并用于实际模型请求 |
| Prompt 对象关联 generation | [关联 traces](https://langfuse.com/docs/prompt-management/features/link-to-traces) | `generation.update({prompt})`；OTLP 属性须与实际版本相符 |
| Prompt 缓存 | [缓存文档](https://langfuse.com/docs/prompt-management/features/caching) | 本地实验 `cacheTtlSeconds: 0`，不把它推为生产统一策略 |
| SDK fallback 与来源区分 | [可用性与 fallback](https://langfuse.com/docs/prompt-management/features/guaranteed-availability) | `fallback` 参数、`isFallback` 检查；本地替代模板不可冒充远端版本 |
| 用量与费用来源 | [Token 与费用](https://langfuse.com/docs/observability/features/token-and-cost-tracking) | 当前默认 usage 和 cost 均为 null，未知不按零计算 |
| client 6.0.2 发布依赖 | [npm 官方元数据](https://registry.npmjs.org/@langfuse/client/6.0.2) | Node >=22，同系列 core/tracing，OTel API peer ^1.9.0 |

## 6.0.2 安装包交叉核对

读取 `node_modules/@langfuse/client/dist/index.d.ts`：

- `prompt.get(name, options)` 支持 `version`、`label`、`cacheTtlSeconds`、`fallback`、`maxRetries`、`fetchTimeoutMs`。
- 返回对象的 `config` 为 `unknown`；`version` 为 number，`isFallback` 为 boolean。
- `prompt.create` 支持 text Prompt；`prompt.update` 接受 `name`、`version`、`newLabels`。
- 某处 `version` 的类型注释写 defaults to latest，与当前官方默认 production 描述不一致。教程和运行命令均显式传 version 或 label，避免依赖该注释推断默认行为。

读取 `@langfuse/tracing/dist/index.mjs` 的属性转换及 `@langfuse/core/dist/index.mjs` 枚举：

- 非 fallback Prompt 对象会写入 `langfuse.observation.prompt.name` 与 `langfuse.observation.prompt.version`。
- fallback 不写远端 Prompt 关联属性；应用另记本地来源与本地模板版本。
- 用量对应 `langfuse.observation.usage_details`；费用对应 `langfuse.observation.cost_details`。没有费用数据时不伪造值。

## 修订覆盖与结果解释

| 章节 | 新增或替换的具体实践 | 结果不能证明什么 |
| --- | --- | --- |
| 36 | 由 compare 的 task 耗时回查 generation/工具 observation，说明并发、小样本与非流式响应 | 不是供应商延迟基准；一题不能给出可信生产 p95 |
| 38 | 从实际报告读 candidate、评分、usage 与未知 cost，沿 task/trace 找到费用范围 | 缺失 usage 不伪造 token；本地不收费不代表系统成本为零 |
| 39 | 创建两版、精确读取/标签读取、配置应用、SDK Prompt 关联、对比、确认推广、回退、fallback | 本地 API 替身不是完整 Langfuse 平台；脚本化模型结果不是 Prompt 质量收益 |
| 40 | Prompt 报告与内容/配置 hash 纳入发布检查，显式更新标签并复核，区分配置回退和质量批准 | 没有实现真实组织审批、多用户授权、小流量平台或有状态全系统回滚 |

A30 使用 `atlas-fixture-01` 的 C-T20 与合成构建结果。资料没有定义 `virtual`，构建成功只证明给定合成构建的状态。两版比较规则为 `a30-rule-1`，是一组有界断言，不能替代人工检查、完整十四题或独立评测集。版本 1 的故意错误用于验证评分和归因，版本 2 的正确 mock 输出不代表真实模型已改善。

报告、OTLP 文件和 HTTP 概要是每次执行的本地证据。外部 Langfuse 的 UI 关联、入库、权限与保留期仍需在已授权环境另验；外部模型需另验 API 兼容性、质量、真实用量与价格。正文不以本地结果代替这些验证。

## 本次只读核验的运行产物

最终读取 `examples/atlas-observability/reports/tests.txt`，记录为 **18 项通过、0 项失败**。已核对的用例包括真实 SDK HTTP 创建/读取/编译、OTLP 父子树和 Prompt 属性、导出前脱敏、配置应用、报告门禁、标签回退、缓存延迟、fallback、越权前置拒绝、零采样，以及综合命令不覆盖各命令专属报告的配对回归。同名命令会更新本地产物，复核时应使用同一轮保存的状态与证据文件。

读取报告确认：

- `compare.json`：`caseCount: 1`，`modelQualityMeasured: false`；两版分别 `quality.pass: false/true`；两者 `usage`、`cost` 都为 `null`。
- 单次结果保留 `appliedModel: atlas-http-mock`、`maxCompletionTokens: 300`、`sourceRevisions: [C-T20@r1]`、Prompt 正文及配置 hash，以及候选答案与规则版本。
- 远端对象形式的 Prompt 经 SDK 写出 `langfuse.observation.prompt.name` 与 `.version`；此处的“远端”是本地 HTTP API 服务，并非 Cloud。
- 综合报告 fallback 记录 `prompt.source: local-fallback`、`prompt.version: null`、`fallbackVersion: local-v2`；对应 generation 没有伪造远端 Prompt 关联。
- 逐项读取 `compare.json` 与 `compare-spans.json`，每个版本的 trace ID 对应 8 个 observation，总计 16 个；generation 的 Prompt 版本与报告一致。
- `promote.json` 的 `reportRunId` 与 `compare.json` 的版本 2 运行精确匹配；`rollback.json` 记录版本 1 和 `qualityNotApproved: true`，不把回退当作质量批准。
- `run-spans.json`、`compare-spans.json`、`all-spans.json` 对应各命令的导出；`spans.json`/`otlp.json` 只是最近快照。归档或重跑时须按 trace ID 配对，不能因文件名存在就认定属于当前报告。

本轮还对四篇正文和本记录检查了单一正文一级标题、相对路径存在及大小写，执行 `git diff --check` 无错误。完整整站构建结果见仓库验证记录。未运行外部 Langfuse、真实模型、真实发布流量或平台 UI 核验。
