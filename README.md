# 邵教练专属会员平台

面向武汉私教业务的完整会员服务平台，包含会员端、教练端、管理端、Hermes 智能助理、DeepSeek API、企业微信机器人推送、持久化数据、账号保护与阿里云容器部署。

## 已实现功能

- 会员端：训练计划、训练计时、饮食与饮水记录、连续打卡、身体指标与趋势、课程预约、会员权益。
- 教练端：会员健康概览、预约日程、恢复与风险提示、AI 建议确认、发送队列。
- 管理端：运营指标、用户角色、服务状态、集成状态、安全与备案提示。
- Hermes Agent：使用 DeepSeek OpenAI 兼容接口流式回答；注入会员近期数据；隐藏推理过程；内置运动风险与医疗边界提示。
- 消息推送：只有教练确认后才能调用企业微信群机器人；Webhook 仅保存在服务器端；未配置时进入待推送队列。
- 数据与安全：PostgreSQL、中国标准手机号登录、bcrypt 密码哈希、HttpOnly/SameSite 会话、角色校验、来源校验、审计日志、备份脚本。
- 响应式体验：桌面、平板、手机完整可用；手机底部导航、抽屉导航、触控友好表单；支持添加到主屏幕。

## 本地运行

要求 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

未配置 DeepSeek 或企业微信时，界面与业务功能仍可演示；Hermes 会明确提示缺少密钥，不会伪造真实发送结果。

## 环境配置

复制 `.env.example` 为 `.env`，至少修改：

- `DEEPSEEK_API_KEY`：DeepSeek 官方 API 密钥。
- `DEEPSEEK_MODEL`：默认 `deepseek-v4-flash`。
- `WECOM_WEBHOOK_URL`：企业微信群中的官方机器人 Webhook 完整地址。
- `SESSION_SECRET`：至少 32 字节随机值。
- `POSTGRES_PASSWORD`：数据库强密码。
- 三种角色的手机号与密码：首次生产启动前全部替换。

任何真实密钥都不能提交到 GitHub。`.env` 已被忽略。

## 阿里云 ECS 部署

推荐 Alibaba Cloud Linux 3 / Ubuntu 24.04，至少 2 核 4GB。安全组仅对公网开放 `80`、`443` 和受限来源的 `22`，不要开放 PostgreSQL 端口。

```bash
cp .env.example .env
# 编辑 .env，填写域名、密钥和强密码
sh scripts/deploy-aliyun.sh
```

部署由四个容器组成：

- Caddy：HTTPS、HTTP/3、压缩、安全响应头与反向代理。
- Web：响应式会员平台。
- API：账号、业务、Hermes 与企业微信推送。
- PostgreSQL：生产业务数据，不暴露公网。

域名解析到 ECS 公网 IP 后，把 `DOMAIN` 改为备案域名并重新运行部署脚本，Caddy 会自动申请 HTTPS 证书。

### 中国内地上线前必须完成

1. 中国内地服务器对外提供网站服务前需完成 ICP 备案。
2. 网站开通之日起 30 日内按要求办理公安联网备案。
3. 在隐私政策和用户协议中补全实际运营主体名称、地址、联系电话、退款规则与个人信息保护负责人。
4. 真实处理健康与身体数据前，由运营主体完成个人信息处理规则、授权流程、最小必要性和供应商数据条款审查。
5. 不使用非官方个人微信自动化方案；当前实现采用企业微信官方机器人接口，降低封号、隐私和稳定性风险。

参考：[阿里云 ICP 备案快速入门](https://help.aliyun.com/zh/icp-filing/basic-icp-service/getting-started/quick-start-for-icp-filing-for-personal-websites)、[阿里云 Docker 与 Compose](https://help.aliyun.com/zh/ecs/user-guide/install-and-use-docker)、[DeepSeek 对话补全文档](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)。

## 企业微信机器人

1. 在企业微信群中添加自定义机器人。
2. 复制机器人 Webhook，填入服务器 `.env` 的 `WECOM_WEBHOOK_URL`。
3. 重新启动 API：`docker compose up -d --force-recreate api`。
4. 在管理端测试集成，再由教练确认一条建议。

Webhook 是高敏感密钥，泄露后应立即在企业微信中删除并重新创建机器人。平台只允许 `https://qyapi.weixin.qq.com/cgi-bin/webhook/send`，避免被利用进行任意网络请求。

## 数据备份与恢复

执行备份：

```bash
sh scripts/backup-postgres.sh
```

可在 ECS 中配置每天凌晨 03:15 运行，并将 `backups/` 同步到阿里云 OSS。脚本默认清理 14 天前的本地备份。

恢复前先停止写入，再执行：

```bash
gunzip -c backups/目标备份.sql.gz | docker compose exec -T postgres psql -U shao shao_platform
```

生产环境应至少完成一次恢复演练。

## 验证

```bash
npx tsc --noEmit
npm test
docker compose config
```

## 目录

- `app/`：页面与 Cloudflare/Sites 预览 API。
- `components/`：响应式产品界面。
- `server/`：阿里云生产 API、账号、PostgreSQL、Hermes 与推送。
- `db/`、`drizzle/`：Sites D1 数据结构与迁移。
- `deployment/`：Caddy 网关配置。
- `scripts/`：部署和备份。

## 交付说明

仓库同时保留两个运行面：

- Sites 私有预览：便于客户验收界面与 D1 业务流程。
- 阿里云生产栈：面向武汉客户，数据留在中国内地 ECS/PostgreSQL，由客户域名提供 HTTPS 服务。

上线时以阿里云生产栈为准。
