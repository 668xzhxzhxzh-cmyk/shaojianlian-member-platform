# 安全发布检查清单

## 修改前

- [ ] 已读根目录 `AGENTS.md` 和部署、回滚文档。
- [ ] 已检查 Git 状态、当前分支、远端和未提交修改。
- [ ] 已说明目标、影响范围、风险、验证方法和是否接触生产。
- [ ] 已确认使用独立分支。
- [ ] 未读取、复制或输出任何真实秘密值。

## CI 与产物

- [ ] lint 通过，或明确说明项目没有 lint 及跳过原因。
- [ ] typecheck 通过，或明确说明项目没有 typecheck 及跳过原因。
- [ ] test 通过，或明确说明项目没有 test 及跳过原因。
- [ ] production build 在 GitHub Runner 通过。
- [ ] artifact 含 Web、API、生产依赖、service 模板、健康检查和回滚脚本。
- [ ] artifact 不含 `.env`、私钥、Token、密码或数据库连接串。
- [ ] CI run 的 commit 与待发布 commit 完全一致。

## 部署前

- [ ] 已获得用户对第一次正式部署的明确确认。
- [ ] `workflow_dispatch` 输入成功 CI run ID 和 40 位 commit SHA。
- [ ] 选择 `DEPLOY`；默认 `NO` 不会连接服务器。
- [ ] 服务器不会运行 npm 安装或构建命令。
- [ ] GitHub Token 只通过标准输入短暂传递。
- [ ] 外层 ZIP 和内层 tar 的 SHA-256 都通过。
- [ ] 新版本位于独立 release 目录，旧版本仍在。

## 切换与验收

- [ ] 候选 API `/health` 返回 200 和 `ok=true`。
- [ ] 候选首页、教练登录页、管理登录页返回 200。
- [ ] 登录接口格式检查返回预期 400，未登录主要 API 返回预期 401。
- [ ] 候选进程稳定后才切换 `current`。
- [ ] 切换后公网 `/health`、首页和两个登录页返回 200。
- [ ] `shao-api`、`shao-web`、`nginx` 为 active。
- [ ] `previous` 指向旧版本，至少保留最近 3 个 release。

## 失败时

- [ ] 校验或候选检查失败时没有切换现网。
- [ ] 切换后失败时已自动恢复旧 `current`。
- [ ] 回滚后再次运行健康检查。
- [ ] 记录失败阶段、CI run、commit、release 和错误，不记录秘密。
- [ ] 未经验证不声称部署或回滚成功。
