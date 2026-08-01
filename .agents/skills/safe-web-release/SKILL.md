---
name: safe-web-release
description: Safely audit, develop, validate, package, deploy, update, inspect CI/CD, or roll back this website. Use when the user asks to develop or modify the website, put it online, deploy, update the server, publish a version, inspect GitHub Actions/CI/CD, diagnose a release, or perform a rollback.
---

# Safe Web Release

按顺序执行，不跳过门禁，不把“计划”当成“已验证结果”。

1. 读取仓库根目录 `AGENTS.md`、`docs/DEPLOYMENT.md`、`docs/ROLLBACK.md`，并完整读取 [部署流程](references/deployment-flow.md) 与 [检查清单](references/checklist.md)。
2. 检查 `git status --short`、当前分支、远端、目标 commit、未提交修改和现有 PR。保护用户已有修改。
3. 向用户简要汇报任务目标、影响范围、风险、验证方法，以及是否会接触生产。
4. 使用独立分支修改；不要直接在生产服务器编辑源代码。
5. 执行项目现有 lint、typecheck、test 和对应 build。若检查项不存在，明确写“跳过”及原因。
6. 提交到 GitHub 并等待目标 commit 的 CI 完成。CI 失败、取消、运行中或 commit 不一致时停止。
7. 只使用该成功 CI 生成的不可变 GitHub artifact；不要用本机生成物部署。
8. 禁止在生产服务器运行 `npm install`、`npm ci`、`npm run build` 或等价构建。
9. 让生产服务器从 GitHub 直接下载 artifact；临时 Token 只通过标准输入传递，不写命令行、文件或日志。
10. 在解压前校验 GitHub artifact ZIP 的 SHA-256，再校验包内 tar 的 SHA-256。任一失败立即停止。
11. 将新版本解压到独立 `releases/<commit-sha>`，不得覆盖当前版本。
12. 在候选端口启动新网站和 API，不改变 Nginx 现网入口。
13. 检查健康接口、首页、教练登录页、管理登录页、登录 API、主要鉴权 API 和候选进程。
14. 全部通过后才原子切换 `current` 并重启 systemd 服务，再检查公网入口和进程状态。
15. 任一切换后检查失败时，立即把 `current` 恢复为旧目标并再次检查。至少保留最近 3 个 release。
16. 部署结束后汇报实际 commit、CI run、artifact 校验、release 目录、健康结果、当前版本、旧版本和回滚状态。
17. 未经验证不得声称完成；未经用户确认不得运行第一次新工作流正式部署。

只做准备或审计时，运行 dry-run 并明确说明没有连接或切换生产。涉及秘密时只报告变量名和是否配置，不读取或输出值。
