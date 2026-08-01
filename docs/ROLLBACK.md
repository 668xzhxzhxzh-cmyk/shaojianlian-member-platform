# 回滚说明

回滚的意思是：新版本有问题时，让网站重新运行上一个已经验证过的完整版本。

## 新流程中的自动回滚

新版本先在候选端口检查，此时 Nginx 仍指向旧网站，所以候选失败不会影响用户。

如果切换 `current` 后公网检查或 systemd 检查失败，`release-deploy.sh` 会：

1. 把 `current` 指回切换前的 release。
2. 重启 `shao-api` 与 `shao-web`。
3. 再次运行健康检查。
4. 保留失败 release 供排查，不把它说成成功版本。

## 手工回滚

release 模式启用后，先列出版本：

```bash
bash /opt/shao-coach/current/scripts/rollback-release.sh --list
```

回到 `previous`：

```bash
bash /opt/shao-coach/current/scripts/rollback-release.sh
```

指定一个 release 目录名：

```bash
bash /opt/shao-coach/current/scripts/rollback-release.sh --target <commit-sha>
```

脚本会检查目标结构、切换、重启和健康检查。目标版本失败时，它会恢复回滚前版本。

## 当前旧流程的限制

目前服务器还没有用新工作流完成第一次正式 release 切换。旧版 Web 目录仍在：

- `.next.previous-20260801-125303`
- `node_modules.previous-20260801-125303`

但是这两个目录不是完整 release，没有统一包含 API、service unit 与 manifest。完整旧流程回滚没有实测，因此状态是 **待确认**。第一次新工作流正式部署会先把当时现网保存为 `legacy-<sha>`，再启用 `current/previous`。

## 绝对不要做

- 不要删除 `current` 或 `previous` 指向的目录。
- 不要用 `git reset --hard` 代替 release 回滚。
- 不要删除数据库或恢复数据库来解决普通前端问题。
- 不要在不知道目标绝对路径时执行递归删除。
- 回滚后未通过健康检查，不得说已经恢复。
