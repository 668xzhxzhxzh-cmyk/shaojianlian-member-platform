export type SessionRole = "member" | "coach" | "admin";

export function portalFetch(
  input: RequestInfo | URL,
  role: SessionRole,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("x-shao-role", role);
  return fetch(input, { ...init, credentials: "include", headers });
}
