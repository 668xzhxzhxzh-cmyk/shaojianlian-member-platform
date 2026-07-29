# 邵教练专属会员平台

面向武汉私教业务的完整会员服务平台，包含会员端、教练端、管理端、原生 Hermes 智能体、DeepSeek API、Hermes 原生微信通道、持久化数据、账号保护与阿里云部署。

## 已实现功能

- 会员端：首页可使用中国内地手机号自助注册并自动登录；支持训练计划、训练计时、饮食与饮水记录、连续打卡、身体指标与趋势、课程预约、会员权益。
- 教练端：会员健康概览、预约日程、恢复与风险提示、AI 建议确认、发送队列。
- 管理端：运营指标、用户角色、服务状态、集成状态、安全与备案提示。
- Hermes Agent：网站通过原生 Hermes API 流式对话，Hermes 使用 `deepseek-v4-flash`；注入会员近期数据；内置运动风险与医疗边界提示。
- 消息推送：只有教练或管理员确认后才能调用 Hermes 原生 Weixin 通道；API 与 Gateway 仅监听服务器回环网络；未扫码或未建立会员会话时进入待推送队列。
- 数据与安全：PostgreSQL、中国标准手机号注册与登录、bcrypt 密码哈希、HttpOnly/SameSite 会话、角色校验、来源校验、审计日志、备份脚本；公开注册固定为会员角色，教练与管理员账号只能由有权限的账号创建。
- 响应式体验：桌面、平板、手机完整可用；手机底部导航、抽屉导航、触控友好表单；支持添加到主屏幕。

## 本地运行

要求 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

未配置原生 Hermes 或微信通道时，界面与其他业务功能仍可运行；系统会明确提示集成未配置，不会伪造真实发送结果。

## 环境配置

复制 `.env.example` 为 `.env`，至少修改：

- `DEEPSEEK_API_KEY`：DeepSeek 官方 API 密钥，只写入 Hermes 的服务器环境。
- `DEEPSEEK_MODEL`：固定使用 `deepseek-v4-flash`。
- `HERMES_API_URL`：原生 Hermes API 的回环地址，原生部署默认 `http://127.0.0.1:8642`。
- `HERMES_API_KEY`：原生 Hermes API 的随机强令牌。
- `WEIXIN_TARGET_ID`：会员先与机器人建立会话后得到的微信会话目标 ID。
- `WECOM_WEBHOOK_URL`：可选的企业微信群官方机器人兼容通道。
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

容器部署由四个容器组成，原生 Hermes 独立运行在宿主机：

- Caddy：HTTPS、HTTP/3、压缩、安全响应头与反向代理。
- Web：响应式会员平台。
- API：账号、业务、原生 Hermes API 代理与微信消息推送。
- PostgreSQL：生产业务数据，不暴露公网。

IP 验收阶段使用 `SITE_ADDRESS=http://公网IP`、`PUBLIC_URL=http://公网IP` 和 `COOKIE_SECURE=false`。域名备案并解析到 ECS 后，把地址改为备案域名、将 `COOKIE_SECURE` 设为 `true` 并重新运行部署脚本，Caddy 会自动申请 HTTPS 证书。

### 中国内地轻量主机部署

如果主机内存小于 4GB，或 Docker Hub 在境内网络超时，可采用当前生产机使用的原生方案：Node.js 22 + Nginx + PostgreSQL 16。前端使用 `npm run build:node` / `npm run start:node`，API 使用 `node server/index.mjs`；参考配置位于：

- `deployment/shao-web.service`
- `deployment/shao-api.service`
- `deployment/hermes-gateway.service`
- `deployment/shao-hermes-send`
- `deployment/shao-hermes-send.sudoers`
- `deployment/shao-backup.service`
- `deployment/shao-backup.timer`
- `deployment/nginx-ip.conf`

生产目录固定为 `/opt/shao-coach`，`.env` 权限应为 `root:shaoapp 0640`；网站、API 和 Hermes API 均只监听 `127.0.0.1`，公网仅由 Nginx 暴露 80/443。Hermes 以独立的 `hermes` 系统用户运行，并通过 systemd 设置内存上限、自动重启与最小文件访问权限。当前 IP 验收完成后，再替换 Nginx 配置中的域名并接入 HTTPS。

### 中国内地上线前必须完成

1. 中国内地服务器对外提供网站服务前需完成 ICP 备案。
2. 网站开通之日起 30 日内按要求办理公安联网备案。
3. 在隐私政策和用户协议中补全实际运营主体名称、地址、联系电话、退款规则与个人信息保护负责人。
4. 真实处理健康与身体数据前，由运营主体完成个人信息处理规则、授权流程、最小必要性和供应商数据条款审查。
5. 微信通道使用 Hermes Agent 内置的 Weixin 适配器；不要替换成非官方维护的个人微信逆向框架。

参考：[阿里云 ICP 备案快速入门](https://help.aliyun.com/zh/icp-filing/basic-icp-service/getting-started/quick-start-for-icp-filing-for-personal-websites)、[阿里云 Docker 与 Compose](https://help.aliyun.com/zh/ecs/user-guide/install-and-use-docker)、[DeepSeek 对话补全文档](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)。

## 微信机器人（腾讯官方通道）

1. 在 ECS 为独立的 `hermes` 系统用户安装原生 Hermes Agent。
2. 在 `/var/lib/hermes/.hermes/.env` 中配置 `DEEPSEEK_API_KEY`、`API_SERVER_KEY`、`API_SERVER_HOST=127.0.0.1`、`API_SERVER_PORT=8642` 和 Weixin 私聊策略。
3. 将 Hermes 默认 provider 设为 `deepseek`，默认模型设为 `deepseek-v4-flash`。
4. 以 `hermes` 用户运行 `hermes gateway setup` 并选择 Weixin，由运营者扫码授权；然后启用 `hermes-gateway.service`。
5. 会员先向机器人发一条消息建立会话，执行 `hermes send --list weixin --json` 获取目标 ID，再写入网站 `.env` 的 `WEIXIN_TARGET_ID`。
6. 安装 `deployment/shao-hermes-send` 到 `/usr/local/bin/`，安装对应 sudoers 规则，再由教练端发送一条测试消息。

`HERMES_API_KEY` 是高敏感密钥，只能保存在服务器环境中。Hermes API 必须绑定 `127.0.0.1`，不能直接暴露公网。平台 API 仅接受 `127.0.0.1`、`localhost` 或 `host.docker.internal` 作为 Hermes API 地址。原生 Weixin 通道以私聊为主，普通微信群消息是否可达取决于微信 iLink Bot 身份能力。

## 数据备份与恢复

执行备份：

```bash
sh scripts/backup-postgres.sh
```

原生 ECS 部署安装 `shao-backup.service` 与 `shao-backup.timer` 后，会在每天凌晨 03:15（Asia/Shanghai，最多随机延迟 5 分钟）自动执行，并默认清理 14 天前的本地备份。生产环境还应将备份异地同步到阿里云 OSS。

恢复前先停止写入，再执行：

```bash
gunzip -c backups/目标备份.sql.gz | docker compose exec -T postgres psql -U shao shao_platform
```

原生 PostgreSQL 部署使用：

```bash
gunzip -c backups/目标备份.sql.gz | psql "$DATABASE_URL"
```

生产环境应至少完成一次恢复演练。

## 验证

```bash
npx tsc --noEmit
npm test
npm run build:node
docker compose config
```

## 目录

- `app/`：页面与 Cloudflare/Sites 预览 API。
- `components/`：响应式产品界面。
- `server/`：阿里云生产 API、账号、PostgreSQL、Hermes 与推送。
- `db/`、`drizzle/`：Sites D1 数据结构与迁移。
- `deployment/`：Caddy、Nginx 与 systemd 生产配置。
- `scripts/`：部署和备份。

## 交付说明

仓库同时保留两个运行面：

- Sites 私有预览：便于客户验收界面与 D1 业务流程。
- 阿里云生产栈：面向武汉客户，数据留在中国内地 ECS/PostgreSQL，由客户域名提供 HTTPS 服务。

上线时以阿里云生产栈为准。
