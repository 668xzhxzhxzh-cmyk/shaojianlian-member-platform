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
        "仅供企业微信中服务器白名单已授权的唯一教练使用。教练 userid 由服务器注入，"
        "工具参数和聊天正文都不能指定或替换身份。所有会员操作必须提供精确 member_id；"
        "禁止根据姓名、昵称或头像猜测会员。创建发送草稿后必须等待教练明确确认，"
        "并且不得把任务创建或企业微信报告已发送表述为会员已收到。"
    ),
)


def _verified_coach_userid() -> str:
    """Return the single server-configured coach identity.

    The WeCom adapter rejects non-allowlisted senders before Hermes runs. The
    MCP process independently binds every operation to the same server-side
    allowlist, so a model or chat message can never choose another coach.
    """

    if len(ALLOWED_COACHES) != 1:
        raise RuntimeError("必须在服务器端配置且仅配置一个授权教练 userid")
    return next(iter(ALLOWED_COACHES))


def _call(operation: str, **payload: Any) -> dict[str, Any]:
    coach_userid = _verified_coach_userid()
    if not TOOL_TOKEN:
        raise RuntimeError("Hermes 管理工具令牌未配置")
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
def get_member_by_id(member_id: str) -> dict[str, Any]:
    """按精确 member_id 查询已绑定给当前教练的会员数据。

    绝对不要传姓名或微信昵称。教练 userid 已由服务器安全绑定，不得询问用户。
    """

    return _call(
        "get_member_by_id",
        member_id=member_id,
    )


@mcp.tool()
def add_private_session(
    member_id: str,
    day: str,
    date: str,
    time: str,
    focus: str,
    status: str = "已预约",
) -> dict[str, Any]:
    """为精确 member_id 新增一节一对一私教并立即同步网站。

    date 使用 M/D，time 使用 HH:MM–HH:MM。禁止创建团体课。
    """

    return _call(
        "add_private_session",
        member_id=member_id,
        day=day,
        date=date,
        time=time,
        focus=focus,
        status=status,
    )


@mcp.tool()
def delete_private_session(
    member_id: str,
    session_id: str,
) -> dict[str, Any]:
    """按精确 member_id 与 session_id 删除课程并立即同步网站。

    删除前应先通过 get_member_by_id 展示目标课程，避免误删。
    """

    return _call(
        "delete_private_session",
        member_id=member_id,
        session_id=session_id,
    )


@mcp.tool()
def update_training_plan(
    member_id: str,
    phase: str,
    goal: str,
    frequency: int,
    focus: str,
    note: str,
    days: list[dict[str, Any]],
) -> dict[str, Any]:
    """更新会员训练方案的完整内容并立即同步网站。"""

    return _call(
        "update_training_plan",
        member_id=member_id,
        phase=phase,
        goal=goal,
        frequency=frequency,
        focus=focus,
        note=note,
        days=days,
    )


@mcp.tool()
def update_nutrition_plan(
    member_id: str,
    calories: int,
    protein: int,
    carbs: int,
    fat: int,
    reminder: str,
    meals: list[dict[str, Any]],
) -> dict[str, Any]:
    """更新会员热量、宏量营养和餐单并立即同步网站。"""

    return _call(
        "update_nutrition_plan",
        member_id=member_id,
        calories=calories,
        protein=protein,
        carbs=carbs,
        fat=fat,
        reminder=reminder,
        meals=meals,
    )


@mcp.tool()
def add_body_feedback(
    member_id: str,
    summary: str,
    next_focus: str,
    risk: str,
) -> dict[str, Any]:
    """新增教练身体反馈并立即同步会员与教练页面。"""

    return _call(
        "add_body_feedback",
        member_id=member_id,
        summary=summary,
        next_focus=next_focus,
        risk=risk,
    )


@mcp.tool()
def update_member_profile(
    member_id: str,
    plan: str,
    expires_at: str,
    level: str,
) -> dict[str, Any]:
    """更新会员计划、到期日期与会员等级并立即同步网站。"""

    return _call(
        "update_member_profile",
        member_id=member_id,
        plan=plan,
        expires_at=expires_at,
        level=level,
    )


@mcp.tool()
def list_customer_ids() -> dict[str, Any]:
    """列出当前教练在企业微信客户联系中的 external_userid。

    结果只用于与明确的 member_id 建立绑定，不得根据昵称自动匹配。
    """

    return _call("list_customer_ids")


@mcp.tool()
def bind_member_external_userid(
    member_id: str,
    external_userid: str,
) -> dict[str, Any]:
    """绑定精确 member_id、external_userid 和当前教练 userid。

    网站会通过企业微信官方客户详情接口验证该客户确实属于当前教练。
    """

    return _call(
        "bind_member_external_userid",
        member_id=member_id,
        external_userid=external_userid,
    )


@mcp.tool()
def create_member_message_draft(
    member_id: str,
    title: str,
    content: str,
) -> dict[str, Any]:
    """为明确 member_id 创建待确认的客户消息草稿。

    此工具不会调用企业微信发送接口，也不代表消息已经发送或收到。
    """

    return _call(
        "create_message_draft",
        member_id=member_id,
        title=title,
        content=content,
    )


@mcp.tool()
def confirm_customer_send_task(
    task_id: str,
    confirmation: str,
) -> dict[str, Any]:
    """在教练明确回复“确认发送”后创建企业微信客户发送任务。

    confirmation 必须逐字为“确认发送”。成功后必须回复：
    “发送任务已创建，请在企业微信客户端确认发送。”
    """

    return _call(
        "confirm_customer_send_task",
        task_id=task_id,
        confirmation=confirmation,
    )


@mcp.tool()
def get_customer_send_task_status(
    task_id: str,
) -> dict[str, Any]:
    """查询客户发送任务状态。

    即使企业微信报告已发送，也不得将其改写为“会员已收到”。
    """

    return _call(
        "get_send_task_status",
        task_id=task_id,
    )


if __name__ == "__main__":
    mcp.run(transport="stdio")
