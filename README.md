# 邵教练专属会员平台

面向武汉私教业务的完整会员服务平台。生产链路由响应式网站、PostgreSQL、一个原生 Hermes 实例、DeepSeek V4 Flash、企业微信智能机器人和企业微信客户联系官方接口组成。

## 已实现

- 会员端：首页使用中国内地手机号自助注册并自动登录；训练计划、训练计时、饮食饮水、连续打卡、身体指标、课程预约与会员权益。
- 教练端：会员健康概览、预约日程、恢复风险提示、AI 建议草稿与发送任务状态。
- 管理端：用户角色、运营指标、服务与集成状态、安全和备案提示。
- 智能体：网站与企业微信 AI Bot 共用现有 Hermes；Hermes 使用 `deepseek-v4-flash`，不安装第二个实例。
- 企业微信入口：教练在“AI健身助理”单聊，或在授权内部群中 `@AI健身助理`。机器人通过 Hermes 原生 WeCom WebSocket 适配器连接 `wss://openws.work.weixin.qq.com`，无需普通群 Webhook。
- 会员工具：只允许企业微信白名单教练调用；按精确 `member_id` 查询，不按昵称、姓名或头像猜测；网站保存 `member_id`、`external_userid`、`coach_userid` 绑定。
- 客户触达：Hermes 只创建企业微信客户联系发送任务。教练先在机器人会话确认草稿，再到企业微信客户端完成官方最终确认。
- 状态语义：创建任务后固定提示“发送任务已创建，请在企业微信客户端确认发送。”；企业微信报告已执行发送也不会被表述为“会员已收到”。
- 安全：PostgreSQL、bcrypt、HttpOnly/SameSite 会话、角色与来源校验、回环内部 API、独立工具令牌、企业微信 userid 白名单和审计日志。
- 响应式：电脑、平板和手机完整可用，支持添加到主屏幕。

本项目不使用 OpenClaw、ClawBot、iLink、个人微信逆向协议或普通微信群 Webhook 机器人。会员只需用普通微信添加教练企业微信，不安装机器人，也不能调用教练管理工具。

## 通信架构

```text
教练企业微信：单聊 / 授权群 @“AI健身助理”
  → 企业微信智能机器人 AI Bot（官方 WebSocket/API 模式）
  → 现有 Hermes（唯一实例）
  → DeepSeek V4 Flash
  → 网站回环内部 API
  → PostgreSQL 会员与绑定数据
  → 企业微信客户联系 add_msg_template
  → 教练在企业微信客户端确认发送
  → 会员普通微信收到客户联系消息
```

企业微信客户联系凭据只是 Hermes 的工具凭据，不创建第二个聊天入口。

## 本地运行

要求 Node.js 22.13 或更高版本。

```bash
npm ci
npm run dev
```

复制 `.env.example` 为 `.env`。本地未配置 Hermes 或企业微信时，注册、登录和其他网站功能仍可运行；系统不会伪造发送成功。

## 生产环境变量

网站 `/opt/shao-coach/.env`：

- `HERMES_API_URL`、`HERMES_API_KEY`：现有 Hermes 回环 API。
- `HERMES_TOOL_TOKEN`：网站与 Hermes MCP 共享的独立强令牌，至少 32 字节。
- `WECOM_ALLOWED_COACH_USERIDS`：唯一或逗号分隔的授权教练企业微信 userid。
- `WECOM_CORP_ID`：企业 ID。
- `WECOM_CONTACT_SECRET`：被配置为“客户联系可调用接口的应用”的 Secret。
- `SESSION_SECRET`、`DATABASE_URL`/PostgreSQL 变量及三种角色初始账号。

Hermes `/var/lib/hermes/.hermes/.env`：

- `DEEPSEEK_API_KEY`、`API_SERVER_KEY`：保留现有值。
- `WECOM_BOT_ID`、`WECOM_SECRET`：扫码创建“AI健身助理”后得到的 AI Bot 凭据。
- `WECOM_DM_POLICY=allowlist`
- `WECOM_ALLOWED_USERS=<教练userid>`
- `WECOM_GROUP_POLICY=allowlist`
- `HERMES_TOOL_TOKEN=<与网站相同的独立强令牌>`

真实密钥只能保存在服务器环境文件中，不能提交到 GitHub。

## 企业微信 AI Bot 配置

当前生产 Hermes `v0.19.0` 已原生支持企业微信 AI Bot WebSocket/API 模式：

- 入站、出站和群内回复均由 Hermes `wecom` 适配器处理。
- AI Bot 需要 `Bot ID` 与 `Secret`，不需要公网回调地址、EncodingAESKey、普通群 Webhook 或独立服务进程。
- 私聊按教练 userid 白名单放行。
- 群聊同时按授权群 chatid 与教练 userid 放行。
- 企业微信适配器先按真实发送者 userid 白名单拦截；会员工具再在服务器端绑定唯一授权教练 userid，聊天正文和模型都不能指定或替换身份。

部署工具：

```bash
sudo sh scripts/install-hermes-wecom-tools.sh /opt/shao-coach
```

然后把 `deployment/hermes-wecom-mcp.example.yaml` 合并到 Hermes `config.yaml`，将 MCP 仅启用到 `wecom` 平台，并验证：

```bash
sudo -u hermes -H /var/lib/hermes/.hermes/hermes-agent/venv/bin/hermes mcp test shao-coach
sudo -u hermes -H /var/lib/hermes/.hermes/hermes-agent/venv/bin/hermes tools --summary
```

目标群第一次 `@AI健身助理` 后，从 WeCom 会话元数据读取真实 chatid，并立即锁定为唯一授权群：

```bash
sudo /usr/local/sbin/shao-wecom-lock-group <chatid>
```

锁定脚本会同时设置群 chatid 白名单和群内教练 userid 白名单，原子保存配置，备份旧文件并验证同一个 Hermes 网关重启成功。

## 企业微信客户联系凭据

管理员在企业微信后台完成以下一次性配置：

1. 在“客户联系”中确认教练已加入使用范围。
2. 创建一个仅作为 API 凭据的自建应用，可见范围只包含授权教练。
3. 在“客户联系 → API → 可调用应用”中加入该自建应用，并把服务器公网 IP 加入企业可信 IP。
4. 从“我的企业 → 企业信息”取得 CorpID，从自建应用详情取得 Secret。

不要把 Secret 发到群聊、工单或提交到 GitHub。在服务器交互式终端执行下面的命令，并按提示输入；Secret 不会回显：

```bash
sudo /usr/local/sbin/shao-wecom-contact-config
```

脚本会原子更新生产 `.env`、保留原文件权限并重启 API。随后应由部署人员调用企业微信官方接口验证凭据、应用权限和可信 IP，而不能只以“已配置”代替真实验证。

## 教练操作流程

1. 教练向“AI健身助理”发送：`查询会员 member_id=...`。
2. Hermes 用当前真实 `coach_userid` 调用精确查询工具。
3. 如需触达会员，Hermes 生成草稿并返回 `task_id`。
4. 教练回复：`确认发送 task_id=<task_id>`。
5. Hermes 调用客户联系接口创建发送任务，并回复：`发送任务已创建，请在企业微信客户端确认发送。`
6. 教练在企业微信客户端执行官方最终确认。
7. 状态查询只显示“等待确认”“企业微信报告已执行发送”或失败原因，绝不显示无法证实的“会员已收到”。

首次绑定会员时，必须由教练明确提供 `member_id` 与企业微信官方 `external_userid`。网站会用客户详情接口验证这个 external_userid 确实属于当前教练。

## 阿里云 ECS

生产机采用中国内地原生部署：Node.js 22、Nginx、PostgreSQL 16 与独立 `hermes` 系统用户。现有网站、数据库、Hermes 和 DeepSeek 原地升级，不重装。

主要文件：

- `deployment/shao-web.service`
- `deployment/shao-api.service`
- `deployment/hermes-gateway.service`
- `deployment/hermes-wecom-soul.md`
- `deployment/hermes-wecom-mcp.example.yaml`
- `deployment/shao-backup.service`
- `deployment/shao-backup.timer`
- `deployment/nginx-ip.conf`

网站、API、Hermes API 和 Hermes 会员工具均只监听或调用 `127.0.0.1`，公网只开放 Nginx 80/443。服务器安全组不开放 PostgreSQL 与 Hermes 端口。

域名解析到 ECS 后配置 HTTPS。中国内地正式对外服务前完成 ICP 备案；网站开通后按法规办理公安联网备案，并补全真实运营主体、隐私政策、健康数据授权与退款规则。

## 数据备份

```bash
sh scripts/backup-postgres.sh
```

`shao-backup.timer` 每天 03:15（Asia/Shanghai）备份 PostgreSQL，默认保留 14 天。生产环境还应异地同步至阿里云 OSS，并完成恢复演练。

## 验证

```bash
npm ci
npx tsc --noEmit
npm run build:node
node --test tests/*.test.mjs
node --check server/index.mjs
node --check server/wecom-contact.mjs
python -m py_compile server/hermes_tools_mcp.py
```

## 目录

- `app/`、`components/`：响应式会员、教练、管理界面。
- `server/`：阿里云生产 API、PostgreSQL、Hermes MCP 与客户联系发送工具。
- `db/`、`drizzle/`：Sites/D1 数据结构和迁移。
- `deployment/`：Nginx、systemd、Hermes 配置模板。
- `scripts/`：部署、备份和 Hermes 工具安装。

正式交付以阿里云生产栈为准。
