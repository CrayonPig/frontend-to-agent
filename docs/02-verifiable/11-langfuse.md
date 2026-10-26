# 11 接入 Langfuse：从平台配置到第一条观测链路

Q03 的答案已经能留下一条本地记录，下一步不是把 `console.log` 换成平台图表，而是让真实 SDK 把一次任务的父子关系、模型调用和业务结果送出去，并能按同一个 ID 找回来。这里的难点有三处：应用和观测平台分别配置什么，程序退出前怎样交付缓冲，以及收到记录后怎样确认它对应的确实是这一次执行。

本篇使用独立的 `examples/atlas-observability` TypeScript 包。它与前面零依赖的规则示例分开安装，使用真实 Langfuse SDK；默认模型端和采集端都在本机。需要时可以只把采集端切到自己的 Langfuse，再把模型端切到已授权的真实服务。三种运行方式共用同一条业务路径，不再靠手工创建一个空 generation 冒充模型调用。

## 先固定这次要观察的任务

用例 `A30-unsupported-capability` 问的是：“AtlasTable 2.0 的 virtual 参数怎么用？演示构建状态如何？”它扩展了 Q05 的任务，不修改 C-T20：文档依然没有虚拟滚动、排序或数据量上限的说明。因此正确答案要分别说明参数证据不足，以及只读工具查到的合成构建状态。构建成功不能反向证明 `virtual` 参数存在。

本地模型是一个 HTTP 替身，接收真实的请求体并返回确定性候选。Langfuse 的 `LangfuseSpanProcessor` 则真正序列化、发送 OTLP 观测数据；本地采集器保留收到的正文用于断言。这个实验能验证客户端上报链路和脱敏，但不能证明 Langfuse 服务端入库、页面展示或真实模型质量。下面平台操作明确列为读者在自己环境中的可选验证。

## 安装独立示例，先不碰账号与密钥

从仓库根目录运行：

```bash
cd examples/atlas-observability
npm ci
npm run build
npm test
npm run demo -- all
```

默认演练不读取真实模型凭证，不向外部模型或 Langfuse 项目写入数据。它会生成 `reports/demo-report.json` 与 `reports/otlp.json`：前者帮助阅读候选答案、判定和 trace ID；后者是本地采集器收到的 SDK 数据，不包含请求认证头。本次本地执行的 `reports/tests.txt` 记录 18 个测试通过；`demo-report.json` 中版本 1 的故意坏候选未通过，版本 2 通过，`all-spans.json` 收到 36 个 observation。模型替身没有返回用量，因此 usage 和 cost 均为 null；这些是本地集成结果，不是模型质量或性能实测。

依赖锁在该包自己的 `package-lock.json`。本次核对日期为 **2026-10-26**，使用 `@langfuse/tracing`、`@langfuse/otel`、`@langfuse/client` 6.0.2；OTel 的 api 为 1.9.0，core 与 sdk-trace-base 为 2.2.0，sdk-node、otlp-exporter-base、exporter-trace-otlp-http 为 0.208.0，TypeScript 为 5.9.3。不要把这些版本改成 `latest` 后沿用原验证结论。该组合含上游已标为弃用的 OTel 包，锁定是为了复现本例；升级应整体检查 peer 依赖和测试。官方 JS/TS v6 要求 Node.js 22+，自托管 Langfuse 至少为 4.59.0。[SDK 与兼容表](https://langfuse.com/docs/observability/sdk/overview)。

运行完先找报告中的 `traceId`，再在 `otlp.json` 中找同一 ID。应能看到任务根 observation 和多个子步骤，而不是只有一条无父子关系的文本日志。此时已经可以继续第 12 篇的业务检查；没有平台账号不阻塞本地学习。

## 有平台时直接配置，没有平台时走官方 Docker 路径

已有 Langfuse 项目时，确认服务版本、项目和部署区域后，可跳到下一节。若自行准备本地实例，下面是在个人演练机器上执行的可选步骤；本次只检查了 Docker/Compose CLI 与 daemon 可用性，没有启动 Langfuse 容器、创建平台用户或生成真实项目密钥。

先确认 Docker 与 Compose 可用，然后在教程仓库之外取得官方配置：

```bash
docker --version
docker compose version
git clone --depth 1 --branch v4.59.0 https://github.com/langfuse/langfuse.git langfuse-local
cd langfuse-local
```

这个 tag 的 `docker-compose.yml` 已按官方仓库核对：它包含 web、worker、PostgreSQL、ClickHouse、Redis 和 MinIO。**源码 tag 不等于镜像已锁定**：文件中的应用镜像使用 `:4`，仍会随拉取时间变化。开始前检查实际解析的镜像列表，部署后确认服务版本不低于 4.59.0，并保存镜像 ID；需要严格复现时，使用核对过的不可变 digest，而不是把浮动标签称为固定版本。

按配置中 `CHANGEME` 标记设置本地秘密。对本次核对的 tag，下列项目使用 `${变量:-默认值}`，可以由 Compose 目录的受限 `.env` 覆盖；若使用其他版本而某项写成硬编码，应编辑该项或采用明确 override，不能假定 `.env` 会覆盖任意文本。

| 配置组 | 必须协调的变量 |
| --- | --- |
| PostgreSQL | `POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB` 与 `DATABASE_URL` 的用户、口令、库名一致 |
| 应用加密与会话 | `SALT`、`ENCRYPTION_KEY`、`NEXTAUTH_SECRET`；`NEXTAUTH_URL` 对应实际页面地址 |
| ClickHouse / Redis | `CLICKHOUSE_PASSWORD`、`REDIS_AUTH`，应用与依赖服务使用相同配置 |
| MinIO | `MINIO_ROOT_USER`、`MINIO_ROOT_PASSWORD` 与 `LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID` / `SECRET_ACCESS_KEY`、`LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID` / `SECRET_ACCESS_KEY`、`LANGFUSE_S3_BATCH_EXPORT_ACCESS_KEY_ID` / `SECRET_ACCESS_KEY` 一致 |

表中 MinIO 的缩写 `/ SECRET_ACCESS_KEY` 表示使用同一完整前缀，例如 `LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY`，不是名为 `SECRET_ACCESS_KEY` 的通用变量。`ENCRYPTION_KEY` 按官方要求用 `openssl rand -hex 32` 生成；其他秘密也要换掉演示默认值。若口令含 URL 保留字符，构造 `DATABASE_URL` 时需正确编码。不要把真实值提交到教程仓库。

配置完成后：

```bash
docker compose config --quiet
docker compose config --images
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=80 langfuse-web langfuse-worker
docker compose images
```

`config --quiet` 验证配置，不把展开后的环境秘密打印出来。打开 `http://localhost:3000`；官方镜像没有默认管理员账号，需要使用界面的注册流程建立自己的组织与项目。这里选择独立演练项目，避免把合成 trace 混进现有生产项目。

若 3000 或 9090 被占用，先查占用来源；调整宿主端口时，同时核对 `NEXTAUTH_URL` 和浏览器使用的媒体地址。若 web 持续等待，查 `docker compose ps` 中的依赖健康状态，再看 worker、数据库或存储服务日志，不要只反复重启 web。官方 Compose 是本地/单机起步方案，不提供本教程已验证的高可用或备份能力。结束演练用 `docker compose stop`；不要为了清理界面误加删除数据卷的参数。[官方 Docker 步骤与限制](https://langfuse.com/self-hosting/deployment/docker-compose)。

## 把观测项目配置交给服务端进程

在项目设置的 API Keys 中取得该项目的 public key 与 secret key。它们用于 Langfuse，不是模型 API key；平台用户角色和 API key 也不是同一种身份。示例 CLI 是服务端程序，不把任何一组凭证交给浏览器。

回到 `examples/atlas-observability`，复制示例环境文件，并在本机编辑真实值：

```bash
cp .env.example .env
```

观测部分需要以下字段；这里仅列名称与含义，不提供可用凭证：

| 字段 | 填写依据 |
| --- | --- |
| `LANGFUSE_BASE_URL` | 本地为 `http://localhost:3000`；托管项目填写所在区域地址 |
| `LANGFUSE_PUBLIC_KEY` | 当前演练项目的 public key |
| `LANGFUSE_SECRET_KEY` | 同一项目的 secret key |
| `LANGFUSE_TRACING_ENVIRONMENT` | 使用 `atlas-demo`，避免混入 production |

`.env` 已被示例忽略，但忽略文件不是秘密管理器；不要放进截图、trace 或评测报告。Node 的 `--env-file` 显式加载文件，不能假定 `npm` 自动加载 `.env`。`LANGFUSE_TRACING_ENVIRONMENT` 用于过滤，不是租户权限边界。[环境配置](https://langfuse.com/docs/observability/features/environments)。

本例还会从平台读取一个演示 Prompt。首次在**独立演练项目**初始化它，随后固定使用版本 2 运行；初始化会写入 Prompt，所以命令要求显式确认：

```bash
node --env-file=.env build/src/cli.js seed-prompts --external --mock-model --confirm
node --env-file=.env build/src/cli.js run --external --mock-model --prompt-version 2
```

第二条命令使用真实 Langfuse 项目和本地 HTTP 模型替身，不产生真实模型调用费用。版本和标签治理留到第 39 篇；这里读取一个确定版本，是为了先排除“取到不同模板”的变量。初始化器只接受预定的 v1/v2：同名版本若已有不同内容或配置，会报 `existing_prompt_differs_do_not_overwrite` 并停止，绝不覆盖。遇到这种情况，换到同名 Prompt 尚不存在的独立演练项目；不能只改命令中的版本数字绕过检查。

## 再替换模型端，不改变上报路径

完成上一节后，才考虑把 `.env` 中的 `MODEL_BASE_URL`、`MODEL_NAME`、`MODEL_API_KEY` 配成自己的模型服务。Prompt config 中的 model 也必须与运行时允许的 `MODEL_NAME` 一致；只更换环境变量、继续读取 model 为 `atlas-http-mock` 的旧模板，会被 `model_not_in_runtime_allowlist` 拒绝。适配器采用 Chat Completions HTTP 结构：发送 `model` 与 `messages`，读取 `choices` 中的内容和结束原因，并在服务有提供时读取 `usage`。它通过 `fetch` 发起实际请求，不依赖在业务代码中手写一个预设 generation 输出。

`MODEL_BASE_URL` 包含版本路径，例如官方接口的 `https://api.openai.com/v1`；适配器追加 `/chat/completions`。携带模型 API key 时，非回环地址必须使用 HTTPS，否则在发送请求前以 `model_https_required` 拒绝；只有 localhost、127.0.0.1 和 ::1 的本地演练允许 HTTP。适配器不跟随重定向。所选模型还要支持 `max_completion_tokens` 和 `response_format: { type: 'json_object' }`。这里没有承诺所有所谓兼容端、模型或返回类型都兼容。

为了完整演练且不覆盖上一节模板，使用另一个空白演练项目，更新 `.env` 的 Langfuse 项目密钥及模型变量，先初始化与该模型匹配的 v1/v2，再执行一次固定版本任务：

```bash
node --env-file=.env build/src/cli.js seed-prompts --external --confirm
node --env-file=.env build/src/cli.js run --external --prompt-version 2
```

第一条只创建 Prompt 配置，不调用模型；第二条才发模型请求。已有项目也可以由维护者按第 39 篇创建新的不可变模板版本，但不能直接修改旧版本或让模型选择任意模型名称。

去掉 `--mock-model` 后才会调用配置的真实模型；这一步可能产生费用，本次未执行。真实服务的限流、拒答、截断、结构错误和用量缺失需要单独验证。用量未提供时保持未知，不写成 0；模型返回了候选 JSON 后，应用仍按资料和结果契约检查。适配字段核对依据为 [Chat Completions 官方接口](https://developers.openai.com/api/reference/resources/chat)，核对日期 2026-10-26；该接口仅作为可替换适配协议，不作为全系列供应商绑定。

## 找到同一条链路，再判断接入完成

命令结束后保留输出中的 trace ID 与任务报告。进入 Langfuse 的同一个项目，先把时间范围缩到刚才的运行时间，环境选 `atlas-demo`，再按 trace ID 定位。没有按项目与环境过滤，常会误把旧演练当成新请求。

依次查看：根名称 `assistant.task`；子 observation 的 parent 关系；generation 的 model、Prompt 名称/版本、用量或未知标记；任务和 session 关联；资料 ID/修订与最终结果类别。点击实际 generation，确认它对应本次模板和调用，而不是另一条重复埋点。最后检查 input/output/metadata 没有密钥、隐藏租户资料或私密推理；平台中的 `ERROR` 与任务判定分别核对，不能因为无红色节点就给质量通过。

如果命令返回结果而平台找不到记录，按“地址与项目 → 服务兼容性 → 凭证 → 网络与导出错误 → 环境/时间过滤 → 缓冲关闭”排查。初始化失败不能靠改 Prompt 修复；generation 用量为空也不意味着调用免费。

## 让最后一批记录有机会送达

在 `src/runtime.ts` 中，SDK 在业务开始前初始化；所有任务完成后先等待 `forceFlush()`，再于 `finally` 路径中 `shutdown()`。两者分别处理在途缓冲和 SDK 生命周期。不要每个 HTTP 请求都初始化并关闭一个 SDK，也不要用立即 `process.exit()` 跳过异步收尾。

本地采集测试会在任务结束后检查真实 SDK 发来的正文，从而验证“调用了 update”之后确实发生了网络导出。外部 Langfuse 仍有服务端接收、持久化与 UI 查询环节，只有在自己的平台找到同一条记录，才可把外部接入记为完成。观测导出失败不应让已成功的业务调用自动重做；恢复策略需要分别处理业务和遥测。

[下一篇：12 自动埋点之外，还需要记录哪些业务动作](12-instrumentation.md) · [学习目录](../README.md)
