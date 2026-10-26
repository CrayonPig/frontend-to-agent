# Atlas：无需密钥的教学运行环境

这不是接好模型的产品，而是让教程中的输入、结果、权限、恢复和观测边界可以实际运行的合成环境。全部身份、资料、任务、工具返回和答案均为原创测试数据。默认使用确定性规则适配器 `atlas-rule-mock-1`，不会请求模型、Elasticsearch、Langfuse 或设备位置，也不会分享真实文档。

## 从仓库根目录运行

环境为 Node.js 22+，没有新增运行依赖。`.mjs` 是可直接执行的 JavaScript；使用 JSDoc/清晰函数契约表达边界，不要求读者为示例配置编译器。正文的 TypeScript 示意与这里的可执行实现应分开阅读。

```bash
npm test
node examples/atlas/evaluate.mjs
node examples/atlas/server.mjs
```

第三条命令启动 `http://127.0.0.1:8787`。打开浏览器，选择版本并输入教程题目。示例界面有等待、接收、完成、失败和取消状态；通过请求代次避免旧请求覆盖新问题。传输为 NDJSON 分块，分块延迟是人为演示设置，**不是模型 token 流或性能实测**。HTTP 测试已覆盖接口和完成事件；浏览器交互仍应按下面步骤人工检查。

1. 提交“Atlas UI 2.0 要按列展示记录，用哪个组件？”并选择 2.0，观察答案与请求 ID。
2. 提交较长问题后立即停止，页面应标明停止等待，不能宣称远端未执行。
3. 连续提交两次不同问题，旧请求不能覆盖新结果。
4. 不选版本，应收到澄清；给 1.8 按钮问题，不应借用 1.4/2.0 答案。

服务仅监听回环地址。它使用固定合成身份 `reader-a / demo-aurora`，**没有真实身份认证**，不能改成公网监听后作为生产服务。请求体不能提交租户或权限；HTTP 接口也不接受 `caseId`，因此浏览器不能自行打开冲突/注入测试夹具。Q09/Q14 由测试程序明确选择。

## 哪些文件负责什么

| 文件 | 可执行能力 | 限制 |
| --- | --- | --- |
| `fixtures.mjs` | 原始 10 张资料卡及 Q01–Q14，8 个开发题、6 个检查题 | 卡片正文是原资料的最小检索表示，事实字段保留关键约束；不是实际文档解析器 |
| `core.mjs` | 授权后关键词评分、版本过滤、规则作答、六种输出类别、引用范围检查 | 只识别有限中文题型；不是通用问答或语义事实验证器 |
| `expectations.mjs` | 与适配器分离的类别、关键断言、禁止内容和来源检查 | 词语断言只覆盖夹具，不是自然语言语义真值判定器 |
| `application.mjs` | 对实际检索与规则作答记录候选 ID、修订和耗时 | 不制造真实模型 generation；拒绝前未检索就没有检索 span |
| `trace.mjs` | 父子记录、导出字段白名单、预授权来源 ID、重试预算、并发上限 | 内存记录；没有平台导出/队列；不记录私密推理 |
| `execution.mjs` | 只读构建状态、固定流程、受限循环、沙箱草稿确认与幂等、检查点文件 | 非生产数据库；没有多进程事务/锁；不调用真实写工具 |
| `governance.mjs` | 作用域缓存、记忆过期/删除、上下文选择、分位数、费用未知、Prompt 标签门槛 | 字符预算不是 token；仅Q14冲突对与compare按钮对有显式原子证据组；缓存采用全局索引代次保守失效；无语义缓存 |
| `evaluate.mjs` | 生成带候选答案、版本、trace 和有限规则评分的报告 | 不测真实模型质量；题集公开可见，不是盲测集 |
| `server.mjs`、`index.html` | 本地单次问答与分块交互 | 固定演示身份，无真实登录、多用户隔离服务或持久任务队列 |

没有实现 embedding、向量库、rerank、MCP、多个自主 Agent、真实模型或 Langfuse 集成。正文相关章节给出机制或可选接入步骤，不能把本示例测试通过当成它们已经运行。

## 数据字段如何对应正文

原始文档事实仍属于 `atlas-fixture-01`。运行文件把文档修订 `r1` 保存为整数 `revision: 1`，导出引用时再序列化为 `C-B14@r1`；产品版本仍是字符串 `version: '1.4'`，两者不混用。正文设计示意中的 `tenantId`、`productVersion` 等字段，在该实现中分别对应可信主体的 `tenant`、文档的 `version`；完整可执行合同以函数签名为准，不能直接把示意对象当作接口请求。

后续教学扩展称为 `atlas-runtime-01`：固定的 AtlasTable 2.0 构建状态、内存迁移草稿与检查点。它不向原始组件资料添加任何新能力，也不说明 AtlasButton 的构建状态。新字段 `buildId`、`observedAt`、`synthetic` 描述工具观察；`draftId`、`previewId`、`contentHash` 描述沙箱写入，不是模型生成的授权。trace 里的 `fixtureVersion` 指原始文档包；工具观察使用其固定构建标识与时刻关联，不把两套数据当成同一版本域。

## 核心调用契约

```js
import { principal } from './fixtures.mjs';
import { DocumentStore, answerQuestion } from './core.mjs';
const store = new DocumentStore();
const result = answerQuestion(store, principal, {
  question: 'Atlas UI 1.4 按钮提交中显示等待并阻止点击怎么设置？',
  version: '1.4',
});
```

`principal` 必须由可信服务端提供。真实实现不能使用此文件中的固定身份，更不能把请求体解析出的对象直接传入。`DocumentStore.visible(principal, { version, caseId })` 在评分前过滤；`retrieve(store, principal, { query, version, caseId, limit })` 只对该范围排序。`validateResult(result, allowedDocs)` 的第二个参数必须来自已授权的候选资料；该函数检查结构与引用范围，不能证明所有文字都是真的。

六种结果为 `answered`、`insufficient_evidence`、`needs_clarification`、`forbidden`、`conflicting_evidence`、`execution_unavailable`。结果类别不等于质量评分：流畅但版本错误的合法结构在负例测试中被判为失败。

`DocumentStore.apply(event)` 只接受比现有修订更大的事件。删除使用 `{id, revision, deleted:true}` 墓碑，旧事件不能复活删除项。更高修订可以明确重建条目，这是显式内容决策，不是旧重试。每次实际变化提升 `generation`，使示例缓存保守失效。

## 草稿和恢复能保证到哪里

```js
import { DraftStore } from './execution.mjs';
const drafts = new DraftStore();
const preview = drafts.preview(principal, {
  taskId: 'task-demo-01', version: '2.0',
  content: '将 loading 改为 pending，保留 disabled。',
});
// 下面调用只应发生在用户审阅相同预览并明确确认之后。
const receipt = drafts.confirm(principal, {
  previewId: preview.previewId,
  contentHash: preview.contentHash,
  idempotencyKey: 'task-demo-01-save-1',
});
```

预览绑定租户、用户、权限修订、任务、版本、内容摘要和 60 秒有效期；确认必须匹配摘要。幂等键按当前主体范围保存；相同键不同内容或不同预览会拒绝。已经成功的操作重复查询原回执，不要求再次产生副作用。此处“写”只是内存里的合成草稿，没有访问仓库或真实 API。

`lookup(principal, key)` 先重新检查权限，再查回执，用于模拟“响应丢失但可能已经保存”。`snapshot()`、`saveCheckpoint(path, state)` 与 `loadCheckpoint(path)` 演示文件持久化与恢复。测试会写到临时目录并清理。单文件原子替换不提供多进程事务，也不能保证外部操作和本地回执一起提交；生产系统仍需事务、执行状态查询或可靠去重协议。

`runAgent({principal, taskId, choose, maxSteps, maxToolCalls, maxCostUnits, deadlineMs, checkpoint, onCheckpoint, trace})` 只允许 `build_status`、`ask`、`finish`。每次选择前预留 1 个**合成成本单位**，不代表美元或真实 token；用于测试预算耗尽时不再调用。默认最多 4 步、2 次工具、4 单位、1000ms。首次启动把时限转换成 `deadlineAt`（可信服务端 Unix 毫秒时间）并随检查点保存；恢复不重置，传入更大的 `deadlineMs` 也不能延长。缺少有效截止时间的旧检查点拒绝恢复。已到期任务不会再调用选择器；本示例不解决时钟回拨或跨机器校时。未知真实费用应另外表示未知，不能用这里的单位冒充真实报价。恢复时重新授权并核对主体与任务，已完成的只读观测可复用；不恢复写操作授权。trace 只是旁路记录，任务检查点单独保存。

## 结果与可重复验证

`reports/baseline.json` 是本次实际运行产生的候选答案与记录，重新执行会改变随机运行标识和耗时。`reports/tests.tap` 是实际测试输出，`reports/verification.md` 说明覆盖与限制。不要比较耗时是否逐字一致。

开发/检查题分开便于避免只看熟悉问题，但检查题已公开，而且实现作者可以读取它们，因此不能称为独立未触碰的模型留出集。当前 14/14 表示规则适配器通过这组明确断言，并非模型正确率 100%。适配器不导入评分文件，但双方仍由同一作者按公开资料实现；后续接真实模型需要额外人工复核和未用于调试的新样例。

检查还会故意把答案改成错误版本、虚构百万行支持、在拒绝中泄露隐藏资料，或忽略冲突，确认评分与边界测试会失败。句子用不同措辞可以通过有限断言，含否定、讽刺或复杂混合语义的文本仍可能误判；这类自动规则不能取代人工判断。

运行版本明确记录 `adapterVersion: atlas-rule-mock-1`，`modelVersion` 与 `promptVersion` 均为 `not-used`；这里没有实际使用模型或 Prompt 模板。`retrieve.docs` 是真正检索函数执行的 span，`answer.compose` 是完整规则作答路径（包括检索）的耗时，不是模型 generation 时长。提前拒绝或澄清不会伪造检索步骤。

真实业务内容不应照搬 `candidateAnswer` 明文保存。这里仅使用合成数据；实际系统需要最小化、脱敏、访问控制、保留期限和删除路径。`Trace` 采用字段白名单并拒绝未授权来源 ID、候选 ID 和修订，但字段中的业务语义与敏感性仍需调用者控制，不构成通用 DLP 产品。
