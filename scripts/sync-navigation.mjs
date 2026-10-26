import { readFileSync, writeFileSync } from 'node:fs';
const catalog = JSON.parse(readFileSync(new URL('./chapters.json', import.meta.url), 'utf8'));
const sidebar = [
  { text: '学习导航', items: [{ text: '完整学习目录', link: '/README' }, { text: '详细大纲与观测路线', link: '/outline' }] },
  ...catalog.map(part => ({ text: part.title, items: part.chapters.map(c => ({ text: c.title, link: `/${c.path.replace(/\.md$/, '')}` })) })),
  { text: '验证与维护', items: [
    { text: '覆盖矩阵与验证状态', link: '/reviews/coverage' },
    { text: '实施与验证记录', link: '/reviews/progress' },
    { text: '旧路径迁移', link: '/reviews/migration' },
    { text: '版本与来源核验', link: '/reviews/sources' },
    { text: '站点开发与部署', link: '/contributing' }
  ] }
];
const configPath = new URL('../docs/.vitepress/config.mts', import.meta.url);
let config = readFileSync(configPath, 'utf8');
config = config.replace(/    sidebar: [\s\S]*?(?=    socialLinks:)/, `    sidebar: ${JSON.stringify(sidebar, null, 2).split('\n').join('\n    ')},\n`);
config = config.replace("{ text: '工程基础', link: '/01-engineering/01-reliability' }", "{ text: '运行与验收', link: '/09-integration/42-handoff' }")
  .replace("{ text: '实战路线', link: '/05-project/01-component-assistant' }", "{ text: '覆盖矩阵', link: '/reviews/coverage' }");
writeFileSync(configPath, config);
const intro = '# 学习目录\n\n围绕同一个 Atlas 组件/API 知识助手，按任务暴露的问题逐步增加能力。42 篇正文按下列 10 部分组织；[详细大纲与观测实践路线](outline.md)规定逐篇操作、观察结果与验收。章节存在与完整实践通过是不同状态，实际范围见[覆盖矩阵](reviews/coverage.md)和[交付验收](09-integration/42-handoff.md)。默认运行路径使用合成数据与确定性 mock，不需要真实模型密钥。\n';
const body = catalog.map(part => `\n## ${part.title}\n\n${part.chapters.map(c => `- [${c.title}](${c.path})`).join('\n')}\n`).join('');
const end = '\n## 怎么使用这份系列\n\n先读 01–02 明确任务与事实边界，再运行合成示例；每次只改变一个条件，留下失败样例、版本与判定理由。35 为可选决策篇，Elasticsearch、Langfuse、MCP 和真实模型都是按需接入，不是完成阅读的前提。\n\n旧文章链接保留为[迁移入口](reviews/migration.md)，不再把旧导读当作独立的完整正文。\n\n[实施记录](reviews/progress.md) · [版本与来源](reviews/sources.md) · [站点开发与部署](contributing.md)\n';
writeFileSync(new URL('../docs/README.md', import.meta.url), intro + body + end);
console.log(`Navigation synchronized: ${catalog.flatMap(p => p.chapters).length} chapters`);
