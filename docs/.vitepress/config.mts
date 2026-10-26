import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: '前端到 Agent',
  description: '用前端工程师已有的工程经验理解 AI Engineering',
  base: '/frontend-to-agent/',
  lastUpdated: true,
  themeConfig: {
    siteTitle: 'Frontend → Agent',
    nav: [
      { text: '开始学习', link: '/README' },
      { text: '详细大纲', link: '/outline' },
      { text: '运行与验收', link: '/09-integration/42-handoff' },
      { text: '覆盖矩阵', link: '/reviews/coverage' }
    ],
    sidebar: [
      {
        "text": "学习导航",
        "items": [
          {
            "text": "完整学习目录",
            "link": "/README"
          },
          {
            "text": "详细大纲与观测路线",
            "link": "/outline"
          }
        ]
      },
      {
        "text": "00 起点：我们要让助手解决什么",
        "items": [
          {
            "text": "01 前端经验能带过来，哪些东西需要重新学",
            "link": "/00-foundations/01-engineering-map"
          },
          {
            "text": "02 组件文档助手的第一张任务清单",
            "link": "/00-foundations/02-assistant-task-list"
          }
        ]
      },
      {
        "text": "01 第一次调用：模型究竟给了我们什么",
        "items": [
          {
            "text": "03 一次模型调用里发生了什么",
            "link": "/01-first-call/03-model-call"
          },
          {
            "text": "04 把第一条请求接进我们的应用",
            "link": "/01-first-call/04-application-request"
          },
          {
            "text": "05 Prompt、上下文与输出契约",
            "link": "/01-first-call/05-prompt-contract"
          },
          {
            "text": "06 流式回答的状态，不只有 loading",
            "link": "/01-first-call/06-streaming-state"
          }
        ]
      },
      {
        "text": "02 先让它可检验，再让它更复杂",
        "items": [
          {
            "text": "07 答案看起来不错，怎么判断真的变好了",
            "link": "/02-verifiable/07-evaluation"
          },
          {
            "text": "08 HTTP 成功之后，还有哪些失败",
            "link": "/02-verifiable/08-failures"
          },
          {
            "text": "09 超时、重试与并发：哪些请求可以再来一次",
            "link": "/02-verifiable/09-request-budget"
          },
          {
            "text": "10 Trace、Observation、Session：一次任务如何串起来",
            "link": "/02-verifiable/10-trace-model"
          },
          {
            "text": "11 接入 Langfuse：从平台配置到第一条观测链路",
            "link": "/02-verifiable/11-langfuse"
          },
          {
            "text": "12 自动埋点之外，还需要记录哪些业务动作",
            "link": "/02-verifiable/12-instrumentation"
          }
        ]
      },
      {
        "text": "03 模型不知道我们的知识，怎么办",
        "items": [
          {
            "text": "13 文档放进 Prompt 就够了吗",
            "link": "/03-knowledge/13-knowledge-strategy"
          },
          {
            "text": "14 文档入库之前，先决定什么不能丢",
            "link": "/03-knowledge/14-document-units"
          },
          {
            "text": "15 先用关键词把组件找到",
            "link": "/03-knowledge/15-keyword-search"
          },
          {
            "text": "16 名字不同、意思相近，怎么找到相关资料",
            "link": "/03-knowledge/16-semantic-search"
          },
          {
            "text": "17 两路结果都有用，如何合并和重排",
            "link": "/03-knowledge/17-hybrid-rerank"
          }
        ]
      },
      {
        "text": "04 找到资料之后，仍然可能答错",
        "items": [
          {
            "text": "18 带引用的答案，真的有依据吗",
            "link": "/04-grounded/18-evidence"
          },
          {
            "text": "19 RAG 评测：没找到，还是找到了却答错",
            "link": "/04-grounded/19-rag-evaluation"
          },
          {
            "text": "20 文档更新以后，旧知识怎么退出系统",
            "link": "/04-grounded/20-knowledge-updates"
          },
          {
            "text": "21 权限隔离与文档中的恶意指令",
            "link": "/04-grounded/21-security"
          }
        ]
      },
      {
        "text": "05 文档回答不了的事，交给受控工具",
        "items": [
          {
            "text": "22 查询实时信息，为什么需要工具",
            "link": "/05-tools/22-live-tools"
          },
          {
            "text": "23 工具描述是给模型看的，执行校验是给系统做的",
            "link": "/05-tools/23-tool-contract"
          },
          {
            "text": "24 固定流程能完成的任务，先不要交给 Agent",
            "link": "/05-tools/24-workflow"
          },
          {
            "text": "25 从只读到写操作：预览、确认与幂等",
            "link": "/05-tools/25-safe-writes"
          }
        ]
      },
      {
        "text": "06 哪些任务值得让 Agent 决定下一步",
        "items": [
          {
            "text": "26 固定流程的分支越来越多，下一步该由谁决定",
            "link": "/06-agent/26-agent-decision"
          },
          {
            "text": "27 一个受限的 Agent 循环",
            "link": "/06-agent/27-bounded-loop"
          },
          {
            "text": "28 任务中断以后，如何安全继续",
            "link": "/06-agent/28-recovery"
          },
          {
            "text": "29 和固定工作流做一次公平对比",
            "link": "/06-agent/29-comparison"
          },
          {
            "text": "30 复盘一次失败的 Agent 任务",
            "link": "/06-agent/30-failure-review"
          }
        ]
      },
      {
        "text": "07 任务更长之后，需要管理什么",
        "items": [
          {
            "text": "31 上下文不是越多越好",
            "link": "/07-capabilities/31-context"
          },
          {
            "text": "32 这次任务的状态，和下次还要记住的信息",
            "link": "/07-capabilities/32-memory"
          },
          {
            "text": "33 把重复做事的方法整理成 Skill",
            "link": "/07-capabilities/33-skills"
          },
          {
            "text": "34 工具越来越多，MCP 解决哪一层的问题",
            "link": "/07-capabilities/34-mcp"
          },
          {
            "text": "35 要不要拆成多个 Agent",
            "link": "/07-capabilities/35-multi-agent"
          }
        ]
      },
      {
        "text": "08 质量稳定之后，再谈系统性优化",
        "items": [
          {
            "text": "36 流式更快，不代表任务完成更快",
            "link": "/08-operations/36-latency"
          },
          {
            "text": "37 缓存命中以后，答案还能不能用",
            "link": "/08-operations/37-cache"
          },
          {
            "text": "38 不是每次调用便宜，而是每次成功任务划算",
            "link": "/08-operations/38-cost"
          },
          {
            "text": "39 Prompt 改了，如何知道哪一版影响了结果",
            "link": "/08-operations/39-prompt-versions"
          },
          {
            "text": "40 一次变更如何安全上线",
            "link": "/08-operations/40-release"
          }
        ]
      },
      {
        "text": "09 回到全局：把这些能力重新连起来",
        "items": [
          {
            "text": "41 一次问题经过了哪些模块",
            "link": "/09-integration/41-architecture"
          },
          {
            "text": "42 如何证明这个知识助手可以交给别人使用",
            "link": "/09-integration/42-handoff"
          }
        ]
      },
      {
        "text": "验证与维护",
        "items": [
          {
            "text": "覆盖矩阵与验证状态",
            "link": "/reviews/coverage"
          },
          {
            "text": "实施与验证记录",
            "link": "/reviews/progress"
          },
          {
            "text": "旧路径迁移",
            "link": "/reviews/migration"
          },
          {
            "text": "版本与来源核验",
            "link": "/reviews/sources"
          },
          {
            "text": "站点开发与部署",
            "link": "/contributing"
          }
        ]
      }
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/CrayonPig/frontend-to-agent' }],
    search: { provider: 'local' },
    outline: { label: '本页目录', level: [2, 3] },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '最后更新于' },
    editLink: {
      pattern: 'https://github.com/CrayonPig/frontend-to-agent/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页'
    },
    footer: { message: '从熟悉的工程问题出发，让 AI 能力成为可靠的产品。' }
  }
})
