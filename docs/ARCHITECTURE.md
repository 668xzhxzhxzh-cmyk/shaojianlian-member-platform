# 系统架构说明

这份文档用来回答“每一部分负责什么”，不保存任何密码或密钥。

## 四个核心部分

### GitHub

GitHub 保存代码并完成所有重活：安装依赖、代码检查、测试、构建、打包和保存运行包。生产服务器配置低，因此 GitHub 构建完成后，阿里云只下载成品。

### 阿里云

阿里云 ECS 规格为 2 核 2 GB，负责运行网站、API、PostgreSQL、Nginx 和唯一 Hermes 服务端。它不负责安装 npm 依赖或构建代码。

公网请求先到 Nginx：

- `/` 转发到网站 `127.0.0.1:3000`。
- `/api/` 和 `/health` 转发到 API `127.0.0.1:8788`。
- PostgreSQL 只在服务器内部供 API 使用。

### DeepSeek

DeepSeek V4 Flash 提供语言模型推理。它不直接读取数据库，也不能绕过网站权限修改会员。所有实际修改必须由 Hermes 调用网站的受控 MCP/API 工具。

### Hermes

服务器只运行一个 Hermes。它通过 `shao-coach` MCP 使用精确 `member_id` 查询或修改课程、训练、饮食和会员资料。

Hermes Desktop 是远程操作界面，不是第二个智能体。Windows 桌面端通过 SSH 隧道访问服务器的 `127.0.0.1:9119`；服务器 Hermes gateway 监听 `127.0.0.1:8642`。

## 企业微信消息

企业微信自建应用是教练入口。Nginx 将 `/api/`（包括唯一回调 `/api/wecom/callback`）统一转发到网站 API `127.0.0.1:8788`，网站完成验签和 AES 解密后再调用服务器上的唯一 Hermes；不得保留把该路径转发到旧 `8645` 适配器的精确路由。旧 WeCom AI Bot、Weixin/iLink 与 OpenClaw 均不启用。客户联系接口负责创建发送任务。教练确认后，企业微信客户端才执行官方发送。没有获得实际发送状态时，系统只能说“发送任务已创建”，不能说会员已收到。

最终通信分工固定如下：教练在企业微信自建应用“AI健身消息服务”向 Hermes 发送管理指令；会员从普通微信进入微信客服“AI健康管理服务”，发送文字或图片并接收 Hermes 回复；课程定时提醒等主动通知继续走企业微信客户联系链路。三类消息复用同一个自建应用和 `/api/wecom/callback` 的签名验证、AES 解密，不创建第二个应用或第二个 Hermes，也不使用企业微信机器人知识库。

微信客服事件 `kf_msg_or_event` 到达现有回调后，服务端调用 `kf/account/list` 按“AI健康管理服务”精确确认 `open_kfid`，再用持久化游标执行 `kf/sync_msg`。文字和图片均只按 `external_userid` 绑定精确定位 `member_id`，禁止昵称猜测。图片通过媒体接口下载后只在内存中交给百炼视觉模型，视觉描述与该会员最近对话再进入服务器上的唯一 Hermes 只读会话；该请求不提供管理工具。原始图片不写数据库或日志。

同步游标、去重消息、有限对话上下文和失败重试状态保存在 PostgreSQL。客服 API 或视觉/模型调用暂时失败时按退避策略重试；日志只记录消息编号、类型、状态与错误码，不记录图片、正文或密钥。

图片由阿里云百炼 `qwen3.7-plus` 作为 Hermes 的只读视觉技能解析为结构化中文描述，再由服务器上的同一个 Hermes 会话结合该会员本人档案和最近上下文生成简短回复。原始图片仅在内存中处理，不写数据库和审计日志；回复只允许通过微信客服官方接口返回给同一 `external_userid`。

当前健康检查显示企业微信客户联系仍未完整启用，相关 Secret 的有效性需要继续确认。

## 发布结构

新发布体系使用：

```text
/opt/shao-coach/
├── .env                 # 网站/API 秘密，只在服务器
├── releases/
│   ├── <commit-sha>/    # 每个版本互不覆盖
│   └── legacy-<sha>/    # 第一次切换前保存的旧现网
├── current -> releases/<当前版本>
└── previous -> releases/<上一个版本>
```

Nginx 不需要跟随版本改配置。systemd 从 `current` 启动网站和 API，切换版本就是原子更新这个符号链接并重启两个应用服务。

## 环境变量存放位置

- GitHub Secrets：`ECS_HOST`、`ECS_USER`、`ECS_SSH_KEY`。
- GitHub 临时凭据：每次 Actions 自动生成的 `github.token`，只通过标准输入交给服务器下载。
- `/opt/shao-coach/.env`：数据库、登录、网站 API、Hermes 工具和企业微信客户联系配置。
- `/etc/default/shao-coach-web`：Web 运行时公开地址配置。
- `/var/lib/hermes/.hermes/.env`：DeepSeek、Hermes、MCP、企业微信入口和桌面会话配置。

真实值不得进入 Git、日志、文档或构建包。
