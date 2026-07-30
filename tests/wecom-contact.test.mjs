import assert from "node:assert/strict";
import test from "node:test";
import { createWecomContactService } from "../server/wecom-contact.mjs";

function request({ address, token = "", body = {} }) {
  const bytes = Buffer.from(JSON.stringify(body));
  return {
    socket: { remoteAddress: address },
    headers: { authorization: token ? `Bearer ${token}` : "" },
    async *[Symbol.asyncIterator]() {
      yield bytes;
    },
  };
}

function response() {
  return {
    status: 0,
    headers: {},
    body: "",
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = String(body || "");
    },
  };
}

test("Hermes member tools reject non-loopback callers before database access", async () => {
  process.env.HERMES_TOOL_TOKEN = "test-tool-token-that-is-long-enough";
  process.env.WECOM_ALLOWED_COACH_USERIDS = "coach-user-1";
  const pool = {
    async query() {
      throw new Error("database must not be reached");
    },
  };
  const service = createWecomContactService({ pool });
  const res = response();
  await service.handleInternalTool(
    request({ address: "203.0.113.8", token: process.env.HERMES_TOOL_TOKEN }),
    res,
  );
  assert.equal(res.status, 403);
  assert.match(res.body, /仅允许服务器回环调用/);
});

test("Hermes member tools reject invalid bearer and unauthorized coach userid", async () => {
  process.env.HERMES_TOOL_TOKEN = "another-test-tool-token";
  process.env.WECOM_ALLOWED_COACH_USERIDS = "coach-user-1";
  const service = createWecomContactService({
    pool: { async query() { throw new Error("database must not be reached"); } },
  });

  const badToken = response();
  await service.handleInternalTool(
    request({
      address: "127.0.0.1",
      token: "wrong",
      body: { operation: "get_member_by_id", coach_userid: "coach-user-1", member_id: "member-1" },
    }),
    badToken,
  );
  assert.equal(badToken.status, 401);

  const badCoach = response();
  await assert.rejects(
    service.handleInternalTool(
      request({
        address: "::1",
        token: process.env.HERMES_TOOL_TOKEN,
        body: { operation: "get_member_by_id", coach_userid: "other-user", member_id: "member-1" },
      }),
      badCoach,
    ),
    /没有 Hermes 管理工具权限/,
  );
});

test("Hermes can add and delete a private session for an exact bound member", async () => {
  process.env.HERMES_TOOL_TOKEN = "website-control-tool-token";
  process.env.WECOM_ALLOWED_COACH_USERIDS = "coach-user-1";
  let state = {
    profile: { id: "member-1", name: "测试会员" },
    bookings: [],
  };
  const pool = {
    async query(sql, params = []) {
      if (String(sql).includes("SELECT u.id,u.name,p.state_json")) {
        return { rows: [{ id: "member-1", name: "测试会员", state_json: state }] };
      }
      if (String(sql).includes("INSERT INTO portal_state")) {
        state = params[1];
        return { rows: [] };
      }
      if (String(sql).includes("INSERT INTO audit_log")) return { rows: [] };
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  const service = createWecomContactService({ pool });
  const added = response();
  await service.handleInternalTool(
    request({
      address: "127.0.0.1",
      token: process.env.HERMES_TOOL_TOKEN,
      body: {
        operation: "add_private_session",
        coach_userid: "coach-user-1",
        member_id: "member-1",
        day: "周五",
        date: "7/31",
        time: "18:00–19:00",
        focus: "下肢力量",
      },
    }),
    added,
  );
  assert.equal(added.status, 201);
  assert.equal(state.bookings.length, 1);
  assert.equal(state.bookings[0].focus, "下肢力量");

  const deleted = response();
  await service.handleInternalTool(
    request({
      address: "::1",
      token: process.env.HERMES_TOOL_TOKEN,
      body: {
        operation: "delete_private_session",
        coach_userid: "coach-user-1",
        member_id: "member-1",
        session_id: state.bookings[0].id,
      },
    }),
    deleted,
  );
  assert.equal(deleted.status, 200);
  assert.equal(state.bookings.length, 0);
});
