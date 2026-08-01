# 部署流程参考

## 读取顺序

执行发布类任务时，先读本文件，再读 `checklist.md`。本文件分为“已经真实成功的旧流程”和“固化后的目标流程”，不得混为一谈。

## 已经真实成功的流程（2026-08-01 审计）

1. **触发分支**：成功 CI run `30611730118` 来自 GitHub 分支 `codex/lock-wecom-group`，commit 为 `685d19d73835a1dbaf46e7d728dff12c0cf50d25`。GitHub 默认分支是 `main`。生产服务器当前本地分支名是 `production`，当前 commit 是 `7916fa88498114d10a953cfd3d38587074b89c9d`。
2. **GitHub 命令**：该 run 在 Ubuntu Runner 依次执行 `npm ci`、`npx tsc --noEmit`、`npm test`、`npm run build:node`、打包、上传 artifact、`docker compose config`。当时没有独立运行 lint，属于已识别缺口。
3. **当时产物内容**：内层 `shao-production-linux.tar.gz` 主要包含 `.next/standalone/` 和根级 `node_modules/`；`.next/standalone/` 中包含 `server.js`、Next 服务端文件、`public/` 和 `.next/static/`。当时产物没有完整包含根级 `server/`，API 源码仍通过服务器 Git 工作树更新，这是已识别缺口。
4. **产物生成与保存**：Runner 用 tar 生成内层 gzip 包，再由 `actions/upload-artifact@v4` 保存为名为 `shao-production-linux` 的 GitHub artifact，保留期当时为 3 天。
5. **服务器下载**：阿里云服务器直接请求 GitHub artifact 下载接口，保存为 `/opt/shao-artifact.zip`；没有经本机电脑转传。
6. **临时凭据**：本次实际操作把短期 GitHub 访问 Token 通过 SSH 标准输入交给服务器下载进程，没有写入仓库或构建包。Token 的具体类型和过期时间没有留在可审计日志中，标记为“待确认”。
7. **SHA-256**：GitHub 外层 ZIP 的 SHA-256 为 `71aab51c9f5eaf56ddb773654349bd44d9ba2ce338ea817292324a0ca171ae94`，服务器现存文件校验一致；解出的内层 tar SHA-256 为 `d096329a82af4451ba974c4e3a3c9c66fa4770f516362196612d87c9cdff4f13`，与部署时本机已下载 artifact 的校验一致。
8. **解压位置**：当时在 `/opt/shao-coach` 原位更新 `.next` 和 `node_modules`，并把旧目录改名为 `.next.previous-20260801-125303`、`node_modules.previous-20260801-125303`。这不是完整独立 release 目录。
9. **进程管理**：`shao-web.service` 运行 `/opt/shao-coach/.next/standalone/server.js`；`shao-api.service` 运行 `/opt/shao-coach/server/index.mjs`；Nginx、Hermes gateway 和 Hermes Desktop backend 也由 systemd 管理。审计时均为 `active/running`。
10. **入口切换**：Nginx 始终代理 127.0.0.1:3000 和 127.0.0.1:8788，本次没有改 Nginx upstream 或符号链接；实际切换依靠替换运行目录后重启 systemd 服务。
11. **健康检查**：已检查 `/health`、`/`、`/coach/login`、`/admin/login`，均返回 HTTP 200；同时检查 `shao-web`、`shao-api`、`nginx`、`hermes-gateway`、`hermes-desktop-serve` 进程。`/health` 显示 DeepSeek、Hermes 和 Hermes 会员工具为 true，企业微信客户联系为 false。
12. **旧流程回滚**：旧 `.next` 和 `node_modules` 目录仍存在，但没有完整保存 API 源码、service unit 与统一 manifest。理论上可手工恢复 Web 文件并将 Git 切回旧 commit，但完整回滚没有实测，必须标记“待确认”，不能声称已经具备完整自动回滚。
13. **Hermes 连接**：服务器唯一 Hermes gateway 监听 127.0.0.1:8642；Hermes Desktop backend 监听 127.0.0.1:9119。Windows 桌面端通过受限 SSH 用户和本地端口转发连接 9119，使用服务器会话 Token。`shao-coach` MCP 位于 `/var/lib/hermes/.hermes/tools/shao_coach_mcp.py`，调用 `http://127.0.0.1:8788/api/internal/hermes/tools`。
14. **环境变量位置**：网站/API 生产变量仅在 `/opt/shao-coach/.env`；Web 公共地址变量在 `/etc/default/shao-coach-web`；DeepSeek、Hermes API、MCP Token、企业微信与桌面会话变量在 `/var/lib/hermes/.hermes/.env`。GitHub 发布所需 SSH 主机、用户和私钥应只在 GitHub Secrets。只记录变量名，不记录值。
15. **仍需人工**：当前需要人工选择正式部署、提供成功 CI run ID 与 commit SHA；只读检查确认仓库目前没有 Actions Secrets，也没有 `production` Environment，因此 `ECS_HOST`、`ECS_USER`、`ECS_SSH_KEY` 和 required reviewer 尚未配置；域名和 HTTPS 仍未绑定；企业微信客户联系 Secret 的有效配置仍未完成。

## 固化后的安全流程

1. `ci.yml` 在 GitHub Runner 安装、lint、typecheck、test、build。
2. Runner 生成包含 Web standalone、API 源码、生产依赖、service 模板、健康检查与回滚脚本的完整 tar，并生成内层 SHA-256。
3. `actions/upload-artifact` 再生成带 GitHub SHA-256 digest 的外层 ZIP。
4. 人工运行 `deploy.yml`，输入成功 CI run ID、完整 commit SHA，并选择 `DEPLOY`。
5. deploy job 确认 CI 路径、状态、仓库、commit 与唯一 artifact 完全匹配。
6. GitHub 临时 Token 通过标准输入交给服务器；服务器直接从 GitHub 下载 ZIP。
7. 服务器先校验外层 ZIP，再校验内层 tar；失败立即退出。
8. 解压到 `/opt/shao-coach/releases/<commit-sha>`，不覆盖现网。
9. 在 3300/8988 候选端口启动并执行完整健康检查。
10. 首次切换前把旧现网固化为 `legacy-<sha>`；`current` 与 `previous` 指向可回滚目录。
11. 候选检查通过后原子切换 `current`，重启 `shao-api` 和 `shao-web`，Nginx 继续使用 3000/8788。
12. 切换后检查公网入口和 systemd；失败自动指回 `previous`。
13. 保留最近至少 3 个 release，且永不删除 `current` 或 `previous` 指向的版本。
