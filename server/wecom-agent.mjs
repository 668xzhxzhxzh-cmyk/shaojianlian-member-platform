const MEMBER_ID_PATTERN = /\bmember_id\s*[=:：]\s*([A-Za-z0-9][A-Za-z0-9_-]{0,127})/i;

export const WECOM_HERMES_REPLY_LIMIT = 160;

export async function resolveWecomMemberContext({
  pool,
  coachUserId,
  content,
  trustedMemberId = "",
  allowSoleBoundMember = false,
}) {
  const explicitMemberId = String(content || "").match(MEMBER_ID_PATTERN)?.[1] || "";
  const result = await pool.query(
    `SELECT u.id,u.name,u.status,p.state_json
     FROM users u
     JOIN member_wecom_bindings b ON b.member_id=u.id AND b.status='active'
     LEFT JOIN portal_state p ON p.user_id=u.id
     WHERE u.role='member' AND u.status='active' AND b.coach_userid=$1
     ORDER BY u.name,u.id`,
    [coachUserId],
  );

  if (explicitMemberId) {
    const member = result.rows.find((row) => row.id === explicitMemberId);
    if (!member) {
      return {
        error: `找不到 member_id=${explicitMemberId}，或该会员未绑定给当前教练。`,
      };
    }
    return memberContext(member, "教练提供的精确 member_id 已通过绑定关系验证");
  }

  const text = String(content || "");
  const exactMatches = result.rows.filter((row) => {
    const name = String(row.name || "").trim();
    return name.length > 0 && text.includes(name);
  });
  if (exactMatches.length === 1) {
    return memberContext(
      exactMatches[0],
      "系统按当前教练名下的有效绑定关系和完整会员名称唯一解析；这是精确 member_id 解析，不是昵称猜测",
    );
  }
  if (exactMatches.length > 1) {
    return {
      context: `完整名称同时对应多条有效绑定，不能自动选择。只简短询问一次精确 member_id。候选：${exactMatches.map((row) => row.id).join("、")}`,
    };
  }
  if (trustedMemberId) {
    const member = result.rows.find((row) => row.id === trustedMemberId);
    if (member) {
      return memberContext(
        member,
        "系统使用当前教练最近 24 小时会话中已验证的精确 member_id 解析本条上下文指令；这不是昵称猜测",
      );
    }
  }
  if (allowSoleBoundMember && result.rows.length === 1) {
    return memberContext(
      result.rows[0],
      "当前教练只有这一条有效会员绑定，系统据此取得精确 member_id；这不是昵称猜测",
    );
  }
  return {
    context: "本条指令没有可由有效绑定关系唯一解析的会员。需要会员操作时，只简短询问一次精确 member_id；禁止按相似昵称、头像或未绑定名称猜测。",
  };
}

export function compactWecomHermesReply(value, limit = WECOM_HERMES_REPLY_LIMIT) {
  const normalized = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const characters = Array.from(normalized);
  if (characters.length <= limit) return normalized;
  return `${characters.slice(0, limit - 1).join("")}…`;
}

function memberContext(member, resolution) {
  return {
    memberId: member.id,
    member,
    context: `当前操作对象已确定为 member_id=${member.id}（${member.name}），且已验证绑定给当前教练。${resolution}。网站最新会员数据：${JSON.stringify(member.state_json || {}).slice(0, 18000)}`,
  };
}
