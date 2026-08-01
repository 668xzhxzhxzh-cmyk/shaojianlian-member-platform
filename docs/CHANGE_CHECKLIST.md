# 网站修改检查清单

## 开始前

- [ ] 已读取 `AGENTS.md` 和 `safe-web-release` Skill。
- [ ] 已检查当前分支与未提交修改。
- [ ] 已说明本次改什么、不改什么、风险和验证方式。
- [ ] 已创建或使用独立分支。
- [ ] 不需要读取任何真实 Secret 值。

## 开发完成后

- [ ] `npm run lint` 通过。
- [ ] `npm run typecheck` 通过。
- [ ] `npm test` 通过。
- [ ] `npm run build:node` 通过。
- [ ] 手机端和电脑端相关页面已按变更范围验证。
- [ ] 没有把 `.env`、Key、密码、Token、SSH 私钥加入 Git。
- [ ] 变更没有重新启用 OpenClaw、Weixin/iLink 或第二个 Hermes。

## 发布前

- [ ] GitHub CI 对同一 commit 为成功。
- [ ] artifact 名称、commit 和 SHA-256 完全匹配。
- [ ] 已得到第一次新流程正式部署的用户确认。
- [ ] 旧版本仍存在。
- [ ] 候选端口检查全部通过。

## 发布后

- [ ] `/health`、首页和两个管理登录页正常。
- [ ] 主要 API 返回预期状态。
- [ ] `shao-web`、`shao-api`、`nginx` 为 active。
- [ ] `current` 是目标 commit，`previous` 是旧版。
- [ ] 至少保留最近 3 个 release。
- [ ] 汇报的是实际检查结果，不是预期结果。
