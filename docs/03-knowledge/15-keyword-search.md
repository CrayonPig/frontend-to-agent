# 15 先用关键词把组件找到

用户输入“AtlasButton 1.4 loading”，最有价值的信息已经写在问题里。此时绕过精确名称，先把整句话转换成语义向量，未必比查名字更可靠。先建立关键词基线，能分清后续改进解决的是术语差异，还是把本来就该命中的组件名弄丢了。

关键词搜索的基本结构是倒排索引：从“词 → 包含该词的文档或片段”反向查找。它不需要每次扫描所有原文。排序再综合词的出现、字段权重等信号，把候选放到前面。它回答的是相关性，不是参数真实性；排名第一也不能免除版本和引用检查。

## 先确定范围，再排序

本例把精确字段与正文分开。组件名、产品版本、可见范围和删除标识用于精确约束；正文用于相关性。版本 `1.4` 是产品标签，不应当成小数范围。`AtlasButton` 可以规范化大小写用于索引，但显示时保留原名。

服务端从身份得到允许范围后，才构造检索条件。reader-a 的范围是共享资料和 demo-aurora，不能让用户的自由文本覆盖这个范围。Q08 自报管理员也不改变它。向量路径、关键词路径、缓存路径都必须遵循同一授权结果。

下面的 Elasticsearch REST 示例使用固定的 **8.19.23** 作为可选学习环境；不要求主线安装它，仓库离线示例也不依赖它。本节请求未在真实 Elasticsearch 实例执行。字段、映射与语法依据官方 8.19 文档核对于 **2026-10-26**，不表示该版本是所有部署的推荐版本。

```http
PUT /atlas-units-demo
Content-Type: application/json

{
  "mappings": {
    "properties": {
      "documentId": { "type": "keyword" },
      "revision": { "type": "keyword" },
      "component": { "type": "keyword" },
      "productVersion": { "type": "keyword" },
      "visibility": { "type": "keyword" },
      "tenantId": { "type": "keyword" },
      "deleted": { "type": "boolean" },
      "body": { "type": "text" }
    }
  }
}
```

向这个专用演示索引写入 C-B14 的一个合成单元。文档 ID 由应用生成并固定，避免重试制造重复记录：

```http
PUT /atlas-units-demo/_doc/C-B14-r1-state?refresh=wait_for
Content-Type: application/json

{
  "documentId": "C-B14", "revision": "r1",
  "component": "AtlasButton", "productVersion": "1.4",
  "visibility": "shared", "tenantId": null, "deleted": false,
  "body": "loading 显示等待图标，不阻止点击；disabled 阻止 click。"
}
```

这个演示正文是原卡的简化派生文本，不替代原卡；生成回答仍应回查原文及其引用范围。下面的过滤条件由应用生成，不接受模型直接提交完整查询 DSL：

```http
POST /atlas-units-demo/_search
Content-Type: application/json

{
  "size": 5,
  "query": {
    "bool": {
      "filter": [
        { "term": { "deleted": false } },
        { "term": { "productVersion": "1.4" } },
        { "bool": {
          "should": [
            { "term": { "visibility": "shared" } },
            { "bool": { "filter": [
              { "term": { "visibility": "tenant" } },
              { "term": { "tenantId": "demo-aurora" } }
            ] } }
          ],
          "minimum_should_match": 1
        } }
      ],
      "should": [
        { "term": { "component": { "value": "AtlasButton", "boost": 4 } } },
        { "match": { "body": "loading" } }
      ],
      "minimum_should_match": 1
    }
  }
}
```

预期结果是 C-B14；这是一条待外部运行验证的预期，不是实测成绩。`filter` 不参与相关性得分，`should` 用于至少匹配一种检索线索。这里显式写出 `minimum_should_match`，避免添加过滤器后，原本以为必需的关键词条件变成可选。该行为参见[官方 bool 查询说明](https://www.elastic.co/guide/en/elasticsearch/reference/8.19/query-dsl-bool-query.html)。

## 可选环境怎么准备

如果读者已经决定试用 Elasticsearch，可按[官方 Docker 安装步骤](https://www.elastic.co/guide/en/elasticsearch/reference/8.19/docker.html)使用 `docker.elastic.co/elasticsearch/elasticsearch:8.19.23`，建立专用本地容器，端口只绑定 `127.0.0.1:9200`。保留默认认证与 TLS，按官方步骤复制 CA 证书、保存服务端凭证，先通过 HTTPS 查询根路径确认返回版本，再执行上述 REST 请求。不要为方便把认证或证书校验关闭，也不要提交证书私钥、密码或环境文件。本文没有创建容器、账号或真实凭证。

外部实验应在专用索引进行，先写入共享卡，再写入两个租户的合成卡，最后分别用两个身份的服务端过滤条件检索。只验证管理员控制台能看到所有记录，不等于应用隔离通过。应用服务账号应按部署需要限制能力；演示的管理请求与面向用户的搜索路径不能共用浏览器凭证。

## 不装搜索服务，也能检查关键边界

在仓库根目录运行下面的命令，可以直接查看内存检索器的真实行为。它按简单词元出现计分，不是 Elasticsearch，也没有实现倒排索引；这个刻意简化的替身用于检验版本与权限过滤，不能代表真实搜索性能。

```bash
node --input-type=module <<'JS'
import { DocumentStore, retrieve } from './examples/atlas/core.mjs'
import { principal } from './examples/atlas/fixtures.mjs'
const store = new DocumentStore()
for (const version of ['1.4', '1.8']) {
  const docs = retrieve(store, principal, {
    query: 'AtlasButton loading', version
  })
  console.log(version, docs.map(d => d.id))
}
JS
```

本次写作时执行同样的调用并用断言检查，1.4 返回 C-B14，1.8 返回空数组；另行检查 reader-a 的可见集合不含 T-B20。这些是离线合成结果，不是外部 Elasticsearch 实测。换成真正的适配器后，仍要复用相同边界断言，再增加分析器、索引刷新和部分故障测试。

索引创建与写入语法分别核对了[显式映射](https://www.elastic.co/guide/en/elasticsearch/reference/8.19/explicit-mapping.html)和[Index API](https://www.elastic.co/guide/en/elasticsearch/reference/8.19/docs-index_.html)，日期同为 2026-10-26。`refresh=wait_for` 仅用于这个小型实验便于紧接着检索；不把逐条等待刷新当成批量摄取的性能方案。

## 基线如何读，不能怎样读

先保留精确名称题 Q02、Q03 和 Q10。它们分别检查 `rowKey`、`loading` 和 `visibility`；再加入 Q01 的“按列展示记录”。名称题失误时先检查大小写、字段映射、分词和过滤，不要立刻归因于没有向量。

中文用途表达可能需要更合适的分词或受控别名，默认分析器的效果要在目标语料上验证。别名表也不是事实来源：把“表格”映射到 AtlasTable 只是帮助找卡，不能追加“支持虚拟滚动”。错误码、函数名和参数名则应保留精确匹配通道，避免被普通文本分析拆散。

记录本次检索的范围版本、索引代次、候选 ID、排名、耗时和失败状态。搜索超时与“正常返回零条”要分开；若允许部分结果，也不能把部分结果当成完整搜索。接口提供了[部分搜索结果相关选项](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-search)，应用应按任务决定是否接受，并把降级信息传给后续阶段。

验收时故意把目标版本改为 1.8：即使名称完全匹配，也应返回无适用资料，而非放宽过滤。再用 reader-a 搜索另一租户说明，确认候选、摘要和聚合都没有越界。关键词基线的价值不是证明它永远够用，而是建立一个范围正确、行为可解释的起点，供下一篇检验语义检索到底补上了什么。

[下一篇：16 名字不同、意思相近，怎么找到相关资料](16-semantic-search.md) · [返回学习目录](../README.md)
