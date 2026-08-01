# 邵教练专属会员平台

面向鄂州私教业务的完整会员服务平台。生产链路由响应式网站、PostgreSQL、一个原生 Hermes 实例、DeepSeek V4 Flash、企业微信自建应用和企业微信客户联系官方接口组成。

## 已实现

- 会员端：首页使用中国内地手机号自助注册并自动登录；训练计划、训练计时、饮食饮水、连续打卡、身体指标、教练排期查看与会员权益。
- 教练端：会员健康概览、课程排期增删、训练/饮食方案、身体反馈、Hermes 管理与发送任务状态。
- 管理端：用户角色、运营指标、服务与集成状态、安全和备案提示。
- 智能体：网站、Hermes Desktop 与企业微信自建应用共用现有 Hermes；Hermes 使用 `deepseek-v4-flash`，不安装第二个实例。
- 企业微信入口：教练只在可见范围受限的自建应用中发送文字指令。网站验证企业微信 SHA-1 签名并完成 AES-256-CBC 解密后，才把白名单教练的指令交给 Hermes。
- 会员工具：只允许企业微信白名单教练调用；按精确 `member_id` 查询，不按昵称、姓名或头像猜测；网站保存 `member_id`、`external_userid`、`coach_userid` 绑定。
- 客户触达：Hermes 只创建企业微信客户联系发送任务。教练先在机器人会话确认草稿，再到企业微信客户端完成官方最终确认。
- 状态语义：创建任务后固定提示“发送任务已创建，请在企业微信客户端确认发送。”；企业微信报告已执行发送也不会被表述为“会员已收到”。
- 安全：PostgreSQL、bcrypt、HttpOnly/SameSite 会话、角色与来源校验、回环内部 API、独立工具令牌、企业微信 userid 白名单和审计日志。
- 响应式：电脑、平板和手机完整可用，支持添加到主屏幕。

本项目不使用 OpenClaw、ClawBot、iLink、个人微信逆向协议或普通微信群 Webhook 机器人。会员只需用普通微信添加教练企业微信，不安装机器人，也不能调用教练管理工具。

## 通信架构

```text
教练企业微信自建应用
  → HTTPS 回调签名验证与 AES 解密
  → 企业微信 userid 白名单
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
- `WECOM_APP_AGENT_ID`、`WECOM_APP_SECRET`：唯一教练自建应用的 AgentID 与 Secret。
- `WECOM_CALLBACK_TOKEN`、`WECOM_CALLBACK_AES_KEY`：接收消息服务器配置中的 Token 与 EncodingAESKey。
- `WECOM_CONTACT_SECRET`：客户联系 API 凭据；留空时复用已被加入“客户联系可调用应用”的 `WECOM_APP_SECRET`。
- `SESSION_SECRET`、`DATABASE_URL`/PostgreSQL 变量及三种角色初始账号。

Hermes `/var/lib/hermes/.hermes/.env`：

- `DEEPSEEK_API_KEY`、`API_SERVER_KEY`：保留现有值。
- `HERMES_TOOL_TOKEN=<与网站相同的独立强令牌>`

真实密钥只能保存在服务器环境文件中，不能提交到 GitHub。

## 企业微信自建应用配置

- 接收消息地址固定为 `https://<备案域名>/api/wecom/callback`。企业微信保存配置时，服务端校验 `msg_signature` 并解密 `echostr` 原样返回。
- POST 回调同样先验签、AES 解密，再按真实 `FromUserName` 与 `WECOM_ALLOWED_COACH_USERIDS` 白名单放行。
- 回调 `MsgId` 会写入去重表；企业微信重试不会重复执行 Hermes 管理操作。
- Hermes 的回复通过自建应用官方 `message/send` 接口回到同一个教练 userid；企业微信客户和未授权成员不会进入 Hermes。
- 中国内地正式配置必须使用与企业主体匹配且已备案的域名；公网 IP 是随后配置的企业可信 IP，不能代替接收消息域名。

部署工具：

```bash
sudo sh scripts/install-hermes-wecom-tools.sh /opt/shao-coach
```

然后把 `deployment/hermes-wecom-mcp.example.yaml` 合并到 Hermes `config.yaml`，将同一个 MCP 启用到网站使用的 `api_server` 和 Hermes Desktop 使用的 `cli` 平台，并验证：

```bash
sudo -u hermes -H /var/lib/hermes/.hermes/hermes-agent/venv/bin/hermes mcp test shao-coach
sudo -u hermes -H /var/lib/hermes/.hermes/hermes-agent/venv/bin/hermes tools --summary
```

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

1. 教练在唯一自建应用中发送：`查询会员 member_id=...`。
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
