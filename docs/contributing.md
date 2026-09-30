# 站点开发与部署

## 本地运行

使用 Node.js 22+，在仓库根目录执行：

```bash
npm ci
npm run docs:dev
```

发布前执行 `npm run docs:build`，预览用 `npm run docs:preview`。预览地址按终端提示打开，并使用 `/frontend-to-agent/` 子路径。

## 新增文章

在对应目录创建 Markdown，使用一级标题定义页面名称，并在 `docs/.vitepress/config.mts` 添加侧边栏入口。优先使用相对 Markdown 链接；构建会检查内部死链。

文章从前端问题切入，解释映射、差异和实践方法。规范见仓库根目录 `AGENTS.md`。

## GitHub Pages 首次启用

1. 打开仓库 Settings → Pages。
2. 在 Build and deployment 的 Source 中选择 GitHub Actions。
3. 打开 Actions → Deploy VitePress to GitHub Pages，手动运行；以后推送 main 会自动发布。
4. 等待 build 和 deploy 都成功，再访问站点。

预期地址：https://CrayonPig.github.io/frontend-to-agent/

GitHub Pages 只托管静态文档；后续助手的模型调用与私有服务需要单独部署。

## 工作流与排障

Pull Request 仅构建，main 推送和手动运行会部署。工作流使用最小权限：构建只读仓库，部署具有 Pages 写入与 OIDC 权限。

- 安装失败：确认 Node 版本和 lockfile，使用 npm ci。
- 构建报告死链：修正文档路径，不关闭检查。
- Pages 未启用：按上面的 Source 设置启用，再重跑工作流。
- 静态资源 404：检查 base 是否为 /frontend-to-agent/。
- 部署等待批准：检查 github-pages 环境的保护规则，由有权限的人按仓库流程处理。

参考：[VitePress 部署文档](https://vitepress.dev/guide/deploy)。
