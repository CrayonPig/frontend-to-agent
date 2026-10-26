# 11 接入 Langfuse：从平台配置到第一条观测链路

上一篇已经定义了 `assistant.task` 和 `model.answer`。现在需要把这些记录放到能查询父子关系、版本和结果的地方。Langfuse 是本系列的可选观测实现，应用的任务契约不依赖它；没有账号、没有密钥时，仍可运行仓库里的本地记录与测试。

接入成功的标准也要先说清：程序创建了 observation，不等于平台已经收到了；平台收到一条 generation，不等于调用了真实模型；链路没有报错，更不等于 Q03 答对。本篇用合成 generation 验证上报路径，真实模型调用在适配层接入后再替换。

## 先锁定版本，避免把几代 SDK 拼起来

本篇核对日期为 **2026-10-26**。官方当前文档使用 JS/TS SDK v6，要求 Node.js 22+；自托管服务最低版本为 4.59.0。本文选择 `@langfuse/tracing` 与 `@langfuse/otel` **6.0.2**，而不是旧版单包 `langfuse` 的调用方式。[SDK 概览与兼容表](https://langfuse.com/docs/observability/sdk/overview)。

OpenTelemetry 的包版本并不全部使用同一个版本号。本文固定以下组合，已在隔离临时目录安装并核对包声明，不修改仓库主线依赖：

| 包 | 固定版本 |
| --- | --- |
| `@langfuse/tracing`、`@langfuse/otel` | 6.0.2 |
| `@opentelemetry/api` | 1.9.0 |
| `@opentelemetry/core`、`@opentelemetry/sdk-trace-base` | 2.2.0 |
| `@opentelemetry/sdk-node`、`@opentelemetry/otlp-exporter-base`、`@opentelemetry/exporter-trace-otlp-http` | 0.208.0 |
| `typescript`，仅用于下面示例编译 | 5.9.3 |

为什么不全部写 `latest`？本次读取 npm 官方发布元数据时，`sdk-node` 最新版 0.300.0 的 API peer 范围与上述 Langfuse 版本并不相同；只锁三个顶层包，也可能让开放范围的 peer 拉入另一代依赖。显式固定这组包，是为了让本篇的编译验证可复现，不是建议长期不升级。安装会出现旧 OTel 包弃用提示；升级应整体核对依赖与回归，不能忽略冲突继续声称兼容。版本依据为发布方的 [Langfuse tracing 元数据](https://registry.npmjs.org/@langfuse/tracing/6.0.2)、[Langfuse otel 元数据](https://registry.npmjs.org/@langfuse/otel/6.0.2)及 [OTel sdk-node 元数据](https://registry.npmjs.org/@opentelemetry/sdk-node/0.208.0)。

## 平台准备与密钥属于服务端

若已有可用 Langfuse 项目，记录项目、区域/地址、环境名称和服务端版本。若没有，可自行选择托管服务，或按[官方 Docker 自托管说明](https://langfuse.com/self-hosting/deployment/docker-compose)准备本地实例；这都是可选步骤，本仓库没有替读者创建账号或部署服务，也没有验证 Docker 拓扑。

项目设置中的 public key 与 secret key 是 Langfuse 上报凭证，不是模型凭证。它们只进入服务端环境；即使字段叫 public key，本例也无需把它传到浏览器。设置 `LANGFUSE_BASE_URL` 指向相应区域或自托管地址，设置 `LANGFUSE_TRACING_ENVIRONMENT=atlas-demo` 便于区分演练数据。[环境配置文档](https://langfuse.com/docs/observability/features/environments)，核对于 2026-10-26。

不要把真实值粘贴进教程或执行记录。仅在自己的可选目录中安装依赖，使用进程环境或未纳入版本控制的环境文件。缺少配置时让演示退出，避免误以为默认地址上的某个项目会自动接收。

```bash
mkdir atlas-observe-demo
cd atlas-observe-demo
npm init -y
npm install --save-exact @langfuse/tracing@6.0.2 @langfuse/otel@6.0.2 @opentelemetry/api@1.9.0 @opentelemetry/core@2.2.0 @opentelemetry/sdk-trace-base@2.2.0 @opentelemetry/sdk-node@0.208.0 @opentelemetry/otlp-exporter-base@0.208.0 @opentelemetry/exporter-trace-otlp-http@0.208.0
npm install --save-dev --save-exact typescript@5.9.3
```

## 一份完整的合成上报程序

将下面保存为 `demo.mts`。它使用明确标为 mock 的 generation，不发送模型请求；只记录题号、版本和来源 ID，不记录文档原文。**这段程序已按固定包组合通过 TypeScript 编译，未连接 Langfuse 服务执行上报，下面的 UI 结果属于待读者验证的预期。**

```ts
import { NodeSDK } from '@opentelemetry/sdk-node'
import { LangfuseSpanProcessor } from '@langfuse/otel'
import { startActiveObservation, propagateAttributes, getActiveTraceId } from '@langfuse/tracing'

for (const key of ['LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'LANGFUSE_BASE_URL']) {
  if (!process.env[key]) throw new Error(`Missing server configuration: ${key}`)
}
const processor = new LangfuseSpanProcessor()
const sdk = new NodeSDK({ spanProcessors: [processor] })
sdk.start()

try {
  await startActiveObservation('assistant.task', async root => {
    await propagateAttributes({
      userId: 'reader-a', sessionId: 'session-demo-01',
      metadata: { taskId: 'task-demo-01', fixtureVersion: 'atlas-fixture-01' }
    }, async () => {
      root.update({ input: { caseId: 'Q03', targetVersion: '1.4' } })
      await startActiveObservation('model.answer', async generation => {
        generation.update({ model: 'atlas-rule-mock-1',
          input: { sourceIds: ['C-B14@r1'] },
          output: { kind: 'answered', fixtureOnly: true },
          metadata: { promptVersion: 'mock-p1', usageKnown: false }
        })
      }, { asType: 'generation' })
      root.update({ output: { resultKind: 'answered', evaluated: false } })
      console.log(JSON.stringify({ traceId: getActiveTraceId() }))
    })
  })
  await processor.forceFlush()
} finally {
  await sdk.shutdown()
}
```

在已提供服务端环境变量后运行：

```bash
npx tsc demo.mts --module nodenext --target es2022 --strict --outDir build
node build/demo.mjs
```

先初始化 `NodeSDK`，再创建 observation；`startActiveObservation` 为回调建立活动上下文，并结束其范围。嵌套的 generation 因此应属于任务根节点。`propagateAttributes` 传播的是本例允许的合成关联字段，不要把用户问题或秘密塞进 metadata。[官方埋点文档](https://langfuse.com/docs/observability/sdk/instrumentation)。

## 缓冲刷新不是每次请求关闭 SDK

SDK 批量导出能减少每个请求等待，但短进程可能在缓冲送出前结束。程序先 `forceFlush()` 等待当前 processor 的缓冲，再在 `finally` 中 `shutdown()` 关闭 SDK；这两个方法的调用签名已对 6.0.2 和所选 OTel 类型声明核对。

长运行服务应在进程启动时初始化一次，在停止接收新请求、等待在途任务收尾后统一关闭，不是在每次 HTTP 响应后 shutdown。运行平台可能强制终止进程，因此优雅关闭仍需要部署环境给予时间，不能承诺所有异常退出都不会丢记录。观测导出失败也不应自动重做已经成功的模型任务。

上报自检按顺序进行：先确认进程打印 trace ID；再在正确项目和 `atlas-demo` 环境查同一 ID；检查根节点下只有一条 mock generation；检查 session、任务和资料版本；最后检查日志和导出字段没有密钥或原文。若找不到，分别排查地址与项目、凭证权限、网络、环境筛选和缓冲生命周期，别先修改任务 Prompt。

这条链路通过后，也只能说“这个环境的合成记录已送达”。将真实适配器放进 generation 范围，再记录真实结束原因和可获得的用量，才是模型观测接入；事实质量仍由第 07 篇评测判断。下一篇补上 SDK 无法自动理解的业务动作。

[下一篇：12 自动埋点之外，还需要记录哪些业务动作](12-instrumentation.md) · [学习目录](../README.md)
