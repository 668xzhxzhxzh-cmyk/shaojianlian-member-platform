#!/usr/bin/env python3
"""Restricted Hermes tools for the Shao Coach member platform.

The MCP process has no direct database credential. It calls the website API
over 127.0.0.1 with a dedicated bearer token, so all authorization and audit
rules stay inside the website service.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from mcp.server.fastmcp import FastMCP


# FastMCP's settings loader probes ".env" in the process working directory.
# Hermes may launch the MCP probe from the website directory, whose production
# .env is intentionally unreadable to the hermes user. Keep this stdio server
# in its own non-secret tool directory before FastMCP initializes.
os.chdir(Path(__file__).resolve().parent)

API_URL = os.environ.get(
    "SHAO_INTERNAL_API_URL",
    "http://127.0.0.1:8788/api/internal/hermes/tools",
).strip()
TOOL_TOKEN = os.environ.get("SHAO_HERMES_TOOL_TOKEN", "").strip()
ALLOWED_COACHES = {
    value.strip()
    for value in os.environ.get("WECOM_ALLOWED_COACH_USERIDS", "").split(",")
    if value.strip()
}

mcp = FastMCP(
    "shao-coach-member-tools",
    instructions=(
        "仅供企业微信中已授权教练使用。所有会员操作必须提供精确 member_id；"
        "禁止根据姓名、昵称或头像猜测会员。创建发送草稿后必须等待教练明确确认，"
        "并且不得把任务创建或企业微信报告已发送表述为会员已收到。"
    ),
)


def _call(operation: str, coach_userid: str, **payload: Any) -> dict[str, Any]:
    coach_userid = str(coach_userid or "").strip()
    if not TOOL_TOKEN:
        raise RuntimeError("Hermes 管理工具令牌未配置")
    if not coach_userid or coach_userid not in ALLOWED_COACHES:
        raise PermissionError("该企业微信 userid 没有管理工具权限")
    body = json.dumps(
        {"operation": operation, "coach_userid": coach_userid, **payload},
        ensure_ascii=False,
    ).encode("utf-8")
    request = Request(
        API_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {TOOL_TOKEN}",
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "Hermes-ShaoCoach-MCP/1.0",
        },
    )
    try:
        with urlopen(request, timeout=25) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            message = json.loads(detail).get("error") or detail
        except json.JSONDecodeError:
            message = detail
        raise RuntimeError(str(message)[:300]) from exc
    except URLError as exc:
        raise RuntimeError("网站内部会员工具暂时不可用") from exc


@mcp.tool()
def get_member_by_id(member_id: str, coach_userid: str) -> dict[str, Any]:
    """按精确 member_id 查询已绑定给当前教练的会员数据。

    绝对不要传姓名或微信昵称；coach_userid 必须来自当前企业微信消息的真实发送者。
    """

    return _call(
        "get_member_by_id",
        coach_userid,
        member_id=member_id,
    )


@mcp.tool()
def list_customer_ids(coach_userid: str) -> dict[str, Any]:
    """列出当前教练在企业微信客户联系中的 external_userid。

    结果只用于与明确的 member_id 建立绑定，不得根据昵称自动匹配。
    """

    return _call("list_customer_ids", coach_userid)


@mcp.tool()
def bind_member_external_userid(
    member_id: str,
    external_userid: str,
    coach_userid: str,
) -> dict[str, Any]:
    """绑定精确 member_id、external_userid 和当前教练 userid。

    网站会通过企业微信官方客户详情接口验证该客户确实属于当前教练。
    """

    return _call(
        "bind_member_external_userid",
        coach_userid,
        member_id=member_id,
        external_userid=external_userid,
    )


@mcp.tool()
def create_member_message_draft(
    member_id: str,
    coach_userid: str,
    title: str,
    content: str,
) -> dict[str, Any]:
    """为明确 member_id 创建待确认的客户消息草稿。

    此工具不会调用企业微信发送接口，也不代表消息已经发送或收到。
    """

    return _call(
        "create_message_draft",
        coach_userid,
        member_id=member_id,
        title=title,
        content=content,
    )


@mcp.tool()
def confirm_customer_send_task(
    task_id: str,
    coach_userid: str,
    confirmation: str,
) -> dict[str, Any]:
    """在教练明确回复“确认发送”后创建企业微信客户发送任务。

    confirmation 必须逐字为“确认发送”。成功后必须回复：
    “发送任务已创建，请在企业微信客户端确认发送。”
    """

    return _call(
        "confirm_customer_send_task",
        coach_userid,
        task_id=task_id,
        confirmation=confirmation,
    )


@mcp.tool()
def get_customer_send_task_status(
    task_id: str,
    coach_userid: str,
) -> dict[str, Any]:
    """查询客户发送任务状态。

    即使企业微信报告已发送，也不得将其改写为“会员已收到”。
    """

    return _call(
        "get_send_task_status",
        coach_userid,
        task_id=task_id,
    )


if __name__ == "__main__":
    mcp.run(transport="stdio")
