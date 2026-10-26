# 13–21 知识与证据章节核验记录

> 历史审阅记录：本文描述基线提交的实现，不代表后续观测实践已完成。修订缺口见[观测审计](observability-audit.md)，最新操作与状态见[详细大纲](../outline.md)和[验证记录](progress.md)。


核验日期：2026-10-26。本记录用于内容审阅，不是外部模型质量报告。

## 完成范围

| 篇号 | 正文 | 本篇新增认知或操作 | 具体材料与验收 |
| --- | --- | --- | --- |
| 13 | [知识获取方案](../03-knowledge/13-knowledge-strategy.md) | 直接取卡、按需检索与行为调整的职责不同 | Q03/Q05/Q06/Q13 的选择记录；资料缺失与服务故障分开 |
| 14 | [文档单元](../03-knowledge/14-document-units.md) | 切分不得丢失条件、版本、权限与来源 | C-B14 等待/禁用关系；表格/代码/缺失权限变形；说明当前整卡实现 |
| 15 | [关键词基线](../03-knowledge/15-keyword-search.md) | 先授权和版本过滤，再计算相关性 | 实际内存调用；可选 ES 映射、写入、查询及准备步骤 |
| 16 | [语义检索](../03-knowledge/16-semantic-search.md) | 几何相关不等于事实/权限/证据 | 手工向量可运行计算，真实 embedding 仍为待验证实验 |
| 17 | [融合与重排](../03-knowledge/17-hybrid-rerank.md) | 去重、融合、重排解决不同问题 | RRF 示意、冲突覆盖与三种方案比较方法；无虚构重排实测 |
| 18 | [证据与答案](../04-grounded/18-evidence.md) | 引用适用性与断言支持性分别检查 | Q03 错版本、无依据扩展；Q05/Q12/Q14 的不同不完整结果 |
| 19 | [RAG 分层评测](../04-grounded/19-rag-evaluation.md) | 摄取、召回、装配、生成与任务失败分别定位 | 可读取的 baseline 报告路径、合成失败记录与故障注入练习 |
| 20 | [更新与删除](../04-grounded/20-knowledge-updates.md) | 内容修订、产品版本与索引代次分开 | 墓碑/迟到重放/缓存失效；可选 alias 切换；说明内存非持久化 |
| 21 | [隔离与注入](../04-grounded/21-security.md) | 检查全部数据路径，拒答不泄露隐藏元数据 | Q08/Q09、中间状态、引用与观测边界；列出尚未实现外部检查 |

以上篇幅约 1500–2000 中文字符，另含代码、表格与技术标识。第 15 篇有完整可选 REST 样例，因此纯中文字符数较少；没有用固定标题模板充数。

## 与合成资料的一致性

- 保持 `atlas-fixture-01`：AtlasButton 1.4 使用 loading，2.0 使用 pending；两版均需 disabled 才阻止 click。
- AtlasTable 2.0 虚拟滚动、排序、数量上限仍为未知，不把缺失写成确定不支持。
- Q14 的 C-T20-A/B 只在该题替换 C-T20，保留同版本同范围冲突；不根据排名或字母选胜者。
- X-T20 仅在 Q09 加入候选；进入候选不代表成为可信证据。
- T-B20 是测试者夹具，reader-a 不得将它放入候选、上下文、引用、缓存或可查看日志；拒答不得泄露其标识和内容。
- 更新演练独立于原始 fixture，不悄悄改变原题答案。主线 mock 的 fact 字段为作者结构化合成事实，不冒充自动知识抽取。

## 官方资料核验

Elasticsearch 可选实验固定 **8.19.23**；官方 8.19 文档的 Docker 页在核对时明确给出该镜像标签。不是最新版本推荐；未创建或运行外部集群。主线没有 Elasticsearch npm 依赖。

| 官方来源 | 核验内容 | 使用位置 |
| --- | --- | --- |
| [Docker 安装](https://www.elastic.co/guide/en/elasticsearch/reference/8.19/docker.html) | 镜像标签、单节点准备、认证、CA 与 HTTPS 检查 | 15 |
| [显式映射](https://www.elastic.co/guide/en/elasticsearch/reference/8.19/explicit-mapping.html) | PUT 创建索引、keyword/text 映射 | 15 |
| [Index API](https://www.elastic.co/guide/en/elasticsearch/reference/8.19/docs-index_.html) | 指定 ID 写入、refresh=wait_for | 15 |
| [Bool 查询](https://www.elastic.co/guide/en/elasticsearch/reference/8.19/query-dsl-bool-query.html) | filter/should 与 minimum_should_match | 15 |
| [Search API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-search) | 部分结果与错误状态需区分 | 15 |
| [kNN 查询](https://www.elastic.co/guide/en/elasticsearch/reference/8.19/query-dsl-knn-query.html) | 相似检索范围、顶层 kNN 建议、预过滤与后过滤区分 | 16 |
| [Aliases API](https://www.elastic.co/guide/en/elasticsearch/reference/8.19/indices-aliases.html) | 多动作切换、must_exist、响应不确定不等于未执行 | 20 |

核对日期均为 2026-10-26。官方版本文档可能继续更新；读者接入时需记录实际实例版本，并在专用环境复验。本文未调用真实 embedding、重排或生成模型，没有相关费用、质量或性能实测。

## 已执行检查

- 本地实际运行 `retrieve`：`AtlasButton loading` + 1.4 只返回 C-B14；目标 1.8 返回空数组。
- 本地实际断言 reader-a 的可见集合不含 T-B20，Q14 返回 `conflicting_evidence`。
- 实际计算手工二维向量余弦结果为 0.994、0.110；这是算术演示，不是语义模型评测。
- `node --test examples/atlas/test/*.test.mjs`：本轮执行时 41 项通过，0 失败。后续集成可能增加测试，以最终整库报告为准。
- 九篇正文单一一级标题、相对链接存在与路径大小写检查通过；`git diff --check` 通过。
- 最终全站构建结果见[整合验证记录](progress.md)。

## 关键限制

没有通用 Markdown 解析器、生产倒排索引、真实 embedding、近似向量服务、模型重排、外部 ES 部署、真实引用访问服务或第三方日志删除验证。对应章节明确区分示意设计、可选步骤与实际 mock 能力。未编造外部结果；没有新增依赖、密钥或账号。
