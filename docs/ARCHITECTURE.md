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

企业微信自建应用是教练入口，客户联系接口负责创建发送任务。教练确认后，企业微信客户端才执行官方发送。没有获得实际发送状态时，系统只能说“发送任务已创建”，不能说会员已收到。

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
