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
      { text: '工程基础', link: '/01-engineering/01-reliability' },
      { text: '实战路线', link: '/05-project/01-component-assistant' }
    ],
    sidebar: [{"text":"学习导航","items":[{"text":"完整学习目录","link":"/README"}]},{"text":"起点","items":[{"text":"能力迁移与系统边界","link":"/00-foundations/01-engineering-map"}]},{"text":"工程基础","items":[{"text":"稳定性：超时、取消与并发","link":"/01-engineering/01-reliability"},{"text":"异常处理：从 HTTP 成功到任务成功","link":"/01-engineering/02-error-handling"},{"text":"缓存与降级：速度之外的正确性","link":"/01-engineering/03-cache-and-fallback"},{"text":"性能：从首屏到任务完成","link":"/01-engineering/04-performance"},{"text":"成本：每个成功任务花了多少","link":"/01-engineering/05-cost"},{"text":"可观测性：请求轨迹与质量反馈","link":"/01-engineering/06-observability"}]},{"text":"LLM 工程","items":[{"text":"LLM 调用契约与结构化输出","link":"/02-llm/01-call-contract"},{"text":"上下文与 Prompt：管理输入依赖","link":"/02-llm/02-context"},{"text":"评测：把不确定输出纳入回归","link":"/02-llm/03-evaluation"}]},{"text":"RAG 工程","items":[{"text":"知识处理：从文档到可检索单元","link":"/03-rag/01-knowledge-pipeline"},{"text":"检索：关键词、语义与混合召回","link":"/03-rag/02-retrieval"},{"text":"回答：证据、引用与拒答","link":"/03-rag/03-grounded-answer"}]},{"text":"Agent 工程","items":[{"text":"工具契约：把函数调用变成受控执行","link":"/04-agent/01-tool-contract"},{"text":"执行循环：状态机、预算与恢复","link":"/04-agent/02-execution-loop"},{"text":"工作流还是 Agent：把自由度放在需要的地方","link":"/04-agent/03-workflow-or-agent"}]},{"text":"综合实践","items":[{"text":"综合实践：组件文档助手","link":"/05-project/01-component-assistant"}]},{"text":"维护","items":[{"text":"站点开发与部署","link":"/contributing"}]}],
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
