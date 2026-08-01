# 部署说明

## 当前已成功运行的方式

2026-08-01 的成功版本由 GitHub Actions run `30611730118` 构建。它来自 `codex/lock-wecom-group` 的 commit `685d19d...`，GitHub Runner 执行依赖安装、类型检查、测试和 Next standalone 构建。阿里云直接从 GitHub 下载 artifact，并完成 SHA-256 校验。

当时仍采用 `/opt/shao-coach` 原位更新，只备份了 `.next` 与 `node_modules`。生产现状已通过只读审计记录在 `.agents/skills/safe-web-release/references/deployment-flow.md`。

## 今后的正常更新顺序

1. 在独立 Git 分支修改代码。
2. 本地运行 `npm run lint`、`npm run typecheck`、`npm test` 和 `npm run build:node`。
3. 推送到 GitHub，打开 Actions 页面查看 `CI`。
4. 等待目标 commit 的 `Verify and package production runtime` 全部变绿。
5. 记下该 CI 的 run ID 和完整 40 位 commit SHA。
6. 第一次正式使用新流程时，先获得用户明确确认。
7. 手工运行 `Deploy verified release to Aliyun ECS`，填写 run ID、commit SHA，并选择 `DEPLOY`。
8. 工作流确认 CI 和 artifact 完全匹配后，阿里云直接下载运行包。
9. 服务器完成外层 ZIP 与内层 tar 两次 SHA-256 校验。
10. 新版本解压到独立 release，先在 3300/8988 候选端口检查。
11. 全部通过后切换 `current`；切换后再检查公网地址和 systemd。

选择默认的 `NO` 会让工作流立即停止，不连接生产服务器。

## 如何查看 GitHub Actions

1. 打开 GitHub 仓库。
2. 点击顶部 `Actions`。
3. 左侧选择 `CI` 查看检查和运行包。
4. 只有绿色 `success` 可以进入部署。
5. 点击某次运行可看到 run ID、commit 和每一步日志。

日志中只能出现变量名、commit、hash、HTTP 状态和目录，不得出现秘密值。

## 如何查看服务器状态

只读检查可查看：

```bash
systemctl is-active shao-web shao-api nginx hermes-gateway hermes-desktop-serve
curl -fsS http://127.0.0.1/health
readlink -f /opt/shao-coach/current
readlink -f /opt/shao-coach/previous
```

不要运行 `npm install`、`npm ci` 或任何 build 命令。

## GitHub 需要的配置

仓库或 `production` Environment 中需要这些 Secrets：

- `ECS_HOST`：服务器地址。
- `ECS_USER`：部署用户；当前流程需要有管理 systemd 和 `/opt/shao-coach` 的权限。
- `ECS_SSH_KEY`：对应部署用户的 SSH 私钥。

2026-08-01 已创建 GitHub `production` Environment，并配置 `ECS_HOST`、`ECS_USER`、`ECS_SSH_KEY`。当前没有 required reviewer；首次正式部署仍由 `workflow_dispatch` 的 `DEPLOY` 确认项保护。

## 不允许做的事

- 不要在服务器拉代码后构建。
- 不要从本机上传 `.next` 或 `node_modules`。
- 不要把密码临时写进 workflow、脚本参数或服务器文件。
- 不要先删除旧版本。
- 不要为了发布修改安全组、数据库、DNS 或域名。
- 不要在 CI 未通过时绕过门禁部署。
