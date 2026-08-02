const CONVERSATION_TTL_HOURS = 24;
const MAX_TURNS = 10;
const MAX_CONTENT_LENGTH = 1200;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function createWecomConversationStore({ pool }) {
  return {
    async load(coachUserId) {
      const coach = String(coachUserId || "").trim();
      if (!coach) return emptyConversation();
      const result = await pool.query(
        `SELECT member_id,session_id,turns_json,updated_at
         FROM wecom_coach_conversations
         WHERE coach_userid=$1
           AND updated_at >= NOW() - ($2 * INTERVAL '1 hour')
         LIMIT 1`,
        [coach, CONVERSATION_TTL_HOURS],
      );
      return normalizeConversation(result.rows[0]);
    },

    async saveTurn({ coachUserId, memberId, sessionId, userContent, assistantContent }) {
      const coach = String(coachUserId || "").trim();
      if (!coach) return emptyConversation();
      const current = await this.load(coach);
      const next = {
        memberId: validId(memberId) || current.memberId,
        sessionId: validId(sessionId) || current.sessionId,
        turns: appendConversationTurns(current.turns, userContent, assistantContent),
      };
      await pool.query(
        `INSERT INTO wecom_coach_conversations
           (coach_userid,member_id,session_id,turns_json,updated_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (coach_userid) DO UPDATE
         SET member_id=EXCLUDED.member_id,
             session_id=EXCLUDED.session_id,
             turns_json=EXCLUDED.turns_json,
             updated_at=NOW()`,
        [coach, next.memberId || null, next.sessionId || null, JSON.stringify(next.turns)],
      );
      return next;
    },
  };
}

export function isContextualFollowUp(value) {
  const text = String(value || "").replace(/\s+/g, "").trim();
  if (!text || text.length > 80) return false;
  return /^(?:请)?(?:把|将)?(?:删除|取消|修改|调整|更新|查看|查询|改)?(?:一下)?(?:这|刚才|上面|前面)/.test(text)
    || /^(?:请)?(?:给)?(?:他|她|TA|ta|这个会员|该会员)/.test(text)
    || /^(?:确认删除|确认发送|确认|继续|好的?|可以|是)$/.test(text);
}

export function isCourseReference(value) {
  return /课程|课表|私教|训练课|放松课|这节|这堂|session_id/i.test(String(value || ""));
}

export function appendConversationTurns(turns, userContent, assistantContent) {
  const normalized = normalizeTurns(turns);
  const additions = [
    { role: "user", content: cleanContent(userContent) },
    { role: "assistant", content: cleanContent(assistantContent) },
  ].filter((turn) => turn.content);
  return [...normalized, ...additions].slice(-MAX_TURNS);
}

export function selectLatestCourseSessionId(state) {
  const bookings = Array.isArray(state?.bookings) ? state.bookings : [];
  for (let index = bookings.length - 1; index >= 0; index -= 1) {
    const sessionId = validId(bookings[index]?.id);
    if (sessionId) return sessionId;
  }
  return "";
}

export function normalizeConversation(row) {
  if (!row) return emptyConversation();
  return {
    memberId: validId(row.member_id),
    sessionId: validId(row.session_id),
    turns: normalizeTurns(row.turns_json),
  };
}

function normalizeTurns(value) {
  const turns = Array.isArray(value) ? value : [];
  return turns
    .filter((turn) => turn && ["user", "assistant"].includes(turn.role))
    .map((turn) => ({ role: turn.role, content: cleanContent(turn.content) }))
    .filter((turn) => turn.content)
    .slice(-MAX_TURNS);
}

function cleanContent(value) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, MAX_CONTENT_LENGTH);
}

function validId(value) {
  const id = String(value || "").trim();
  return ID_PATTERN.test(id) ? id : "";
}

function emptyConversation() {
  return { memberId: "", sessionId: "", turns: [] };
}
