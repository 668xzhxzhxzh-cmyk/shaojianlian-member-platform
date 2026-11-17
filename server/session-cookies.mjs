export const SESSION_ROLES = ["member", "coach", "admin"];
export const LEGACY_SESSION_COOKIE = "shao_session";
export const SESSION_COOKIE_NAMES = Object.freeze({
  member: "shao_member_session",
  coach: "shao_coach_session",
  admin: "shao_admin_session",
});

export function isSessionRole(value) {
  return SESSION_ROLES.includes(String(value || ""));
}

export function requestedSessionRole(request) {
  const value = request?.headers?.["x-shao-role"];
  return isSessionRole(value) ? String(value) : "";
}

export function parseCookieHeader(header) {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    if (!name) continue;
    cookies[name] = part.slice(separator + 1).trim();
  }
  return cookies;
}

export function sessionTokenForRole(cookieHeader, role) {
  if (!isSessionRole(role)) return "";
  const cookies = parseCookieHeader(cookieHeader);
  return cookies[SESSION_COOKIE_NAMES[role]] || cookies[LEGACY_SESSION_COOKIE] || "";
}

export function sessionCookie(role, token, { secure = true, maxAge = 43_200 } = {}) {
  if (!isSessionRole(role)) throw new TypeError("Invalid session role");
  return `${SESSION_COOKIE_NAMES[role]}=${token}; Path=/; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearSessionCookies(role, { secure = true } = {}) {
  if (!isSessionRole(role)) return [];
  const attributes = `Path=/; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Strict; Max-Age=0`;
  return [
    `${SESSION_COOKIE_NAMES[role]}=; ${attributes}`,
    `${LEGACY_SESSION_COOKIE}=; ${attributes}`,
  ];
}
