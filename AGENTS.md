# 项目长期规则

本文件适用于整个仓库。任何人或智能体修改、发布、排障或回滚本项目时都必须遵守。

## 生产架构边界

- 当前生产服务器是阿里云 ECS，规格为 2 核 2 GB，应用根目录为 `/opt/shao-coach`。
- GitHub Actions 负责安装依赖、lint、typecheck、test、build 和生成完整 Linux 生产运行包。
- 阿里云只负责下载、校验和运行已经构建完成的生产包。
- 禁止在生产服务器执行 `npm ci`、`npm install`、`npm run build` 或等价构建命令。
- Nginx 只作为公网入口，将 `/` 转发到网站端口 3000，将 `/api/` 和 `/health` 转发到 API 端口 8788。
- PostgreSQL 保存会员、登录、方案、课程、绑定关系和审计数据。
- DeepSeek 只提供模型推理，不直接访问数据库或自行发送客户消息。
- Hermes 是唯一执行型智能体，通过 `shao-coach` MCP 和网站内部 API 管理会员数据；必须使用精确 `member_id`。
- Hermes Desktop 只是服务器 Hermes 的远程客户端，通过受限 SSH 隧道连接服务器 127.0.0.1:9119，不是第二个 Hermes 实例。
- 企业微信客户联系接口负责创建客户发送任务；未取得实际发送状态前不得说会员已收到。

## 必须使用的流程

- 用户要求开发网站、修改网站、上线、部署、更新服务器、发布版本、检查 CI/CD 或回滚时，使用 `.agents/skills/safe-web-release/` 中的 `safe-web-release` Skill。
- 开始前读取本文件、`docs/DEPLOYMENT.md`、`docs/ROLLBACK.md` 和 Skill 引用的清单。
- 检查 Git 状态、当前分支、未提交修改和目标 commit；不得覆盖用户已有修改。
- 在独立分支修改。先汇报目标、影响范围、风险和验证方法。
- 每次修改至少运行项目现有的 lint、typecheck、test 和对应 build；不存在的检查项要明确写“跳过”及原因。
- CI 失败、取消、仍在运行或找不到对应 artifact 时禁止部署。
- 部署必须使用与成功 CI commit 完全一致的 GitHub artifact。
- 下载后先做 SHA-256 校验；校验失败时不得解压、启动或切换。
- 新版本必须进入独立 `releases/<commit-sha>` 目录，不覆盖正在运行的版本。
- 新版本先在候选端口完成首页、教练登录页、管理登录页、健康接口和主要 API 检查，再允许切换。
- 切换后再次检查公网入口和 systemd 进程；失败时立即自动回滚。
- 至少保留最近 3 个可回滚 release；不得删除 `current` 或 `previous` 指向的版本。
- 未经实际验证不得使用“部署成功”“已经恢复”“会员已收到”等完成性表述。

## 禁止事项

- 不得把 API Key、数据库连接串、数据库密码、账号密码、Cookie 密钥、SSH 密码、SSH 私钥、GitHub Token 或企业微信 Secret 写入仓库、日志、artifact 或文档。
- 真实凭据只能放在 GitHub Actions Secrets、GitHub 临时 `github.token`、`/opt/shao-coach/.env`、`/etc/default/shao-coach-web` 或 `/var/lib/hermes/.hermes/.env`。
- 未经用户明确允许，不得重装服务器、重置实例、删除数据库、清空数据目录、修改安全组、修改 DNS、绑定或更换域名。
- 不得先删除旧版本再发布新版本，不得覆盖生产目录中的现行运行文件。
- 不得用本机电脑中转生产 artifact；阿里云必须直接从 GitHub 下载。
- 不得重新启用 OpenClaw、Weixin/iLink 或第二个 Hermes 实例。

## 生产确认

- 新 `deploy.yml` 的第一次正式运行必须等用户明确确认。
- 正式部署必须由 `workflow_dispatch` 手工输入成功 CI run ID、完整 commit SHA，并选择 `DEPLOY`。
- 未确认时只允许审计、测试、构建、打包、工作流语法验证和不会切换现网的 dry-run。
