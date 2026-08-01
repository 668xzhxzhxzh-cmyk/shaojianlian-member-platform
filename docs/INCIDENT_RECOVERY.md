# 故障恢复说明

## 先判断故障在哪一层

### 网站完全打不开

先查看 Nginx、Web 和 API：

```bash
systemctl is-active nginx shao-web shao-api
curl -I http://127.0.0.1:3000/
curl -fsS http://127.0.0.1:8788/health
```

不要一上来重装服务器、修改安全组或删除文件。

### 页面能开但无法登录

检查 `/health`、`shao-api` 日志和 PostgreSQL 状态。不要打印 `.env`；只确认所需变量名是否存在。

### Hermes 无法执行会员任务

依次确认：

1. `hermes-gateway` 是否 active。
2. `shao-api` 是否 active。
3. `/health` 中 `hermesMemberTools` 是否为 true。
4. MCP 是否仍指向 `127.0.0.1:8788/api/internal/hermes/tools`。
5. 指令是否使用精确 `member_id`。

不要安装第二个 Hermes，也不要重新启用 OpenClaw。

### 企业微信任务无法发送

检查 `/health` 的 `wecomContact`。如果为 false，只能说明客户联系接口未配置完成，不能说消息已发送。Secret 只在服务器环境变量中处理，不复制到聊天或 GitHub。

## 发布中断时

- 下载或 SHA-256 失败：没有解压或切换，旧站继续运行；重新检查 CI run 与 artifact。
- 候选端口失败：没有切换，查看候选 transient unit 日志；不要重启现网。
- 切换后失败：部署脚本应自动恢复 `previous`；随后再次检查公网和 systemd。
- 自动回滚也失败：停止继续切换，保留目录和日志，使用 `docs/ROLLBACK.md` 的手工流程恢复一个已知健康 release。

## 如何看日志而不泄密

可以查看最近日志：

```bash
journalctl -u shao-web -u shao-api -n 100 --no-pager
```

汇报时删除请求 Token、Cookie、Authorization、数据库连接串和用户密码。不要运行 `cat .env`。

## 绝对禁止

- 禁止重置阿里云实例或重装系统。
- 禁止删除 PostgreSQL 数据目录或执行全库清空。
- 禁止递归删除 `/opt/shao-coach`、`/opt`、根目录或用户主目录。
- 禁止在事故处理中临时关闭鉴权、泄露 Secret 或开放内部端口到公网。
- 禁止未经允许修改安全组、DNS 或域名。
- 禁止在没有健康检查证据时宣布恢复。
