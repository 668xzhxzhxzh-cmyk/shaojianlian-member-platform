import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSessionCookies,
  requestedSessionRole,
  SESSION_COOKIE_NAMES,
  sessionCookie,
  sessionTokenForRole,
} from "../server/session-cookies.mjs";

test("member, coach and admin sessions use independent cookies", () => {
  assert.equal(new Set(Object.values(SESSION_COOKIE_NAMES)).size, 3);
  const header = [
    `${SESSION_COOKIE_NAMES.member}=member-token`,
    `${SESSION_COOKIE_NAMES.coach}=coach-token`,
    `${SESSION_COOKIE_NAMES.admin}=admin-token`,
  ].join("; ");
  assert.equal(sessionTokenForRole(header, "member"), "member-token");
  assert.equal(sessionTokenForRole(header, "coach"), "coach-token");
  assert.equal(sessionTokenForRole(header, "admin"), "admin-token");
});

test("role selection is explicit and logout only clears the selected role", () => {
  assert.equal(requestedSessionRole({ headers: { "x-shao-role": "coach" } }), "coach");
  assert.equal(requestedSessionRole({ headers: {} }), "");
  assert.match(sessionCookie("admin", "signed-token", { secure: false }), /^shao_admin_session=signed-token;/);
  const cleared = clearSessionCookies("coach", { secure: false });
  assert.match(cleared[0], /^shao_coach_session=;/);
  assert.doesNotMatch(cleared.join("\n"), /shao_member_session|shao_admin_session/);
});

test("legacy cookie remains a one-session migration fallback", () => {
  assert.equal(sessionTokenForRole("shao_session=legacy-token", "member"), "legacy-token");
});
