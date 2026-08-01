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

function statePool(initialState) {
  let state = structuredClone(initialState);
  const audits = [];
  return {
    get state() {
      return state;
    },
    audits,
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes("SELECT u.id,u.name,p.state_json")) {
        if (params[0] !== "member-1" || params[1] !== "coach-user-1") {
          return { rows: [] };
        }
        return { rows: [{ id: "member-1", name: "测试会员", state_json: state }] };
      }
      if (text.includes("INSERT INTO portal_state")) {
        assert.equal(params[0], "member-1");
        state = structuredClone(params[1]);
        return { rows: [] };
      }
      if (text.includes("INSERT INTO audit_log")) {
        audits.push({ actor: params[1], action: params[2], detail: params[3] });
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

async function runHermesOperation(service, body) {
  const res = response();
  await service.handleInternalTool(
    request({
      address: "127.0.0.1",
      token: process.env.HERMES_TOOL_TOKEN,
      body: {
        coach_userid: "coach-user-1",
        member_id: "member-1",
        ...body,
      },
    }),
    res,
  );
  return { response: res, result: JSON.parse(res.body) };
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
    /没有 AI 管理工具权限/,
  );
});

test("Hermes can add and delete a private session for an exact bound member", async () => {
  process.env.HERMES_TOOL_TOKEN = "website-control-tool-token";
  process.env.WECOM_ALLOWED_COACH_USERIDS = "coach-user-1";
  const pool = statePool({
    profile: { id: "member-1", name: "测试会员" },
    bookings: [],
  });
  const service = createWecomContactService({ pool });
  const added = await runHermesOperation(service, {
    operation: "add_private_session",
    day: "周五",
    date: "7/31",
    time: "18:00–19:00",
    focus: "下肢力量",
    request_id: "member-1-20260731-1800",
  });
  assert.equal(added.response.status, 201);
  assert.equal(added.result.sync, "网站页面已自动同步");
  assert.equal(pool.state.bookings.length, 1);
  assert.equal(pool.state.bookings[0].focus, "下肢力量");

  const replayed = await runHermesOperation(service, {
    operation: "add_private_session",
    day: "周五",
    date: "7/31",
    time: "18:00–19:00",
    focus: "下肢力量",
    request_id: "member-1-20260731-1800",
  });
  assert.equal(replayed.result.idempotent_replay, true);
  assert.equal(pool.state.bookings.length, 1);

  const updated = await runHermesOperation(service, {
    operation: "update_private_session",
    session_id: pool.state.bookings[0].id,
    day: "周六",
    date: "8/1",
    time: "16:00–17:00",
    focus: "核心稳定",
    status: "待确认",
  });
  assert.equal(updated.response.status, 200);
  assert.equal(pool.state.bookings[0].focus, "核心稳定");
  assert.equal(pool.state.bookings[0].status, "待确认");

  const deleted = await runHermesOperation(service, {
    operation: "delete_private_session",
    session_id: pool.state.bookings[0].id,
  });
  assert.equal(deleted.response.status, 200);
  assert.equal(pool.state.bookings.length, 0);
  assert.deepEqual(pool.audits.map((item) => item.action), [
    "hermes_private_session_added",
    "hermes_private_session_updated",
    "hermes_private_session_deleted",
  ]);
});

test("Hermes updates training, nutrition, body feedback and member profile by exact member_id", async () => {
  process.env.HERMES_TOOL_TOKEN = "website-control-tool-token";
  process.env.WECOM_ALLOWED_COACH_USERIDS = "coach-user-1";
  const pool = statePool({
    profile: { id: "member-1", name: "测试会员", plan: "基础计划" },
    bookings: [],
    trainingPlan: {},
    nutritionPlan: {},
    bodyFeedbacks: [],
  });
  const service = createWecomContactService({ pool });

  const training = await runHermesOperation(service, {
    operation: "update_training_plan",
    phase: "第 2 周",
    goal: "改善圆肩",
    frequency: 4,
    focus: "肩胛控制",
    note: "动作质量优先",
    days: [{
      id: "day-1",
      title: "上肢拉力",
      duration: "65 分钟",
      exercises: ["高位下拉 · 4×10", "面拉 · 3×15"],
    }],
  });
  assert.equal(training.response.status, 200);
  assert.equal(training.result.sync, "网站页面已自动同步");
  assert.equal(pool.state.trainingPlan.goal, "改善圆肩");
  assert.equal(pool.state.trainingPlan.frequency, 4);
  assert.deepEqual(pool.state.trainingPlan.days[0].exercises, ["高位下拉 · 4×10", "面拉 · 3×15"]);

  const nutrition = await runHermesOperation(service, {
    operation: "update_nutrition_plan",
    calories: 2100,
    protein: 145,
    carbs: 230,
    fat: 65,
    reminder: "训练日增加复合碳水",
    meals: [{
      type: "午餐",
      time: "12:30",
      food: "米饭、清蒸鱼和青菜",
      calories: 650,
    }],
  });
  assert.equal(nutrition.response.status, 200);
  assert.equal(nutrition.result.sync, "网站页面已自动同步");
  assert.equal(pool.state.nutritionPlan.calories, 2100);
  assert.equal(pool.state.nutritionPlan.meals[0].food, "米饭、清蒸鱼和青菜");

  const feedback = await runHermesOperation(service, {
    operation: "add_body_feedback",
    summary: "肩颈紧张度下降，深蹲稳定性提高",
    next_focus: "继续观察右侧肩胛控制",
    risk: "注意",
  });
  assert.equal(feedback.response.status, 201);
  assert.equal(feedback.result.sync, "网站页面已自动同步");
  assert.equal(pool.state.bodyFeedbacks.length, 1);
  assert.equal(pool.state.bodyFeedbacks[0].nextFocus, "继续观察右侧肩胛控制");

  const profile = await runHermesOperation(service, {
    operation: "update_member_profile",
    plan: "体态改善 · 私教 24 节",
    expires_at: "2027-07-31",
    level: "金卡会员",
  });
  assert.equal(profile.response.status, 200);
  assert.equal(profile.result.sync, "网站页面已自动同步");
  assert.deepEqual(
    {
      plan: pool.state.profile.plan,
      expiresAt: pool.state.profile.expiresAt,
      level: pool.state.profile.level,
    },
    {
      plan: "体态改善 · 私教 24 节",
      expiresAt: "2027-07-31",
      level: "金卡会员",
    },
  );
  assert.deepEqual(pool.audits.map((item) => item.action), [
    "hermes_training_plan_updated",
    "hermes_nutrition_plan_updated",
    "hermes_body_feedback_added",
    "hermes_member_profile_updated",
  ]);

  await assert.rejects(
    runHermesOperation(service, {
      operation: "update_member_profile",
      member_id: "member-other",
      plan: "不应写入",
    }),
    /未找到该 member_id/,
  );
  assert.equal(pool.state.profile.plan, "体态改善 · 私教 24 节");
});

test("member-specific contact QR automatically binds the official add-customer callback", async () => {
  process.env.HERMES_TOOL_TOKEN = "website-control-tool-token";
  process.env.WECOM_ALLOWED_COACH_USERIDS = "coach-user-1";
  process.env.WECOM_CORP_ID = "ww-test-corp";
  process.env.WECOM_CONTACT_SECRET = "test-contact-secret";

  let issuedState = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/cgi-bin/gettoken") {
      return { ok: true, status: 200, async json() { return { errcode: 0, access_token: "access-1", expires_in: 7200 }; } };
    }
    if (url.pathname === "/cgi-bin/externalcontact/add_contact_way") {
      const body = JSON.parse(String(options.body));
      issuedState = body.state;
      assert.deepEqual(body.user, ["coach-user-1"]);
      return { ok: true, status: 200, async json() { return { errcode: 0, config_id: "config-1", qr_code: "https://work.weixin.qq.com/ca/test-qr" }; } };
    }
    if (url.pathname === "/cgi-bin/externalcontact/get") {
      assert.equal(url.searchParams.get("external_userid"), "wm-customer-1");
      return { ok: true, status: 200, async json() { return { errcode: 0, external_contact: { name: "🐻🐻君" }, follow_user: [{ userid: "coach-user-1" }] }; } };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const links = new Map();
  let binding = { member_id: "member-1", coach_userid: "coach-user-1", external_userid: null };
  let syncedUserName = "测试会员";
  let portalState = { profile: { name: "测试会员" }, suggestions: [{ member: "测试会员" }] };
  const audits = [];
  const database = {
    async query(sql, params = []) {
      const text = String(sql);
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") return { rows: [] };
      if (text.includes("SELECT u.id,u.name,u.status,b.coach_userid,b.external_userid")) {
        return { rows: [{ id: "member-1", name: "测试会员", status: "active", ...binding }] };
      }
      if (text.includes("INSERT INTO member_wecom_bindings") && params[1] === "coach-user-1" && params.length === 2) {
        return { rows: [] };
      }
      if (text.includes("UPDATE wecom_binding_links") && text.includes("status='superseded'")) {
        for (const link of links.values()) {
          if (link.member_id === params[0] && link.coach_userid === params[1] && link.status === "pending") link.status = "superseded";
        }
        return { rows: [] };
      }
      if (text.includes("INSERT INTO wecom_binding_links")) {
        links.set(params[0], {
          state_token: params[0], member_id: params[1], coach_userid: params[2],
          config_id: params[3], qr_code: params[4], status: "pending",
          external_userid: null, expires_at: params[5],
        });
        return { rows: [] };
      }
      if (text.includes("FROM wecom_binding_links") && text.includes("state_token=$1")) {
        const link = links.get(params[0]);
        return { rows: link ? [{ ...link }] : [] };
      }
      if (text.includes("SELECT member_id FROM member_wecom_bindings WHERE external_userid")) {
        return { rows: binding.external_userid === params[0] ? [{ member_id: binding.member_id }] : [] };
      }
      if (text.includes("SELECT external_userid FROM member_wecom_bindings WHERE member_id")) {
        return { rows: binding.member_id === params[0] ? [{ external_userid: binding.external_userid }] : [] };
      }
      if (text.includes("INSERT INTO member_wecom_bindings") && params.length === 3) {
        binding = { member_id: params[0], external_userid: params[1], coach_userid: params[2] };
        return { rows: [] };
      }
      if (text.includes("UPDATE wecom_binding_links") && text.includes("status='consumed'")) {
        Object.assign(links.get(params[0]), { status: "consumed", external_userid: params[1] });
        return { rows: [] };
      }
      if (text.includes("UPDATE users SET name=$2")) {
        syncedUserName = params[1];
        return { rows: [] };
      }
      if (text.includes("SELECT state_json FROM portal_state")) {
        return { rows: [{ state_json: structuredClone(portalState) }] };
      }
      if (text.includes("UPDATE portal_state SET state_json=$2")) {
        portalState = structuredClone(params[1]);
        return { rows: [] };
      }
      if (text.includes("INSERT INTO audit_log")) {
        audits.push({ action: params[2], detail: params[3] });
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
    async connect() {
      return { query: this.query.bind(this), release() {} };
    },
  };

  try {
    const service = createWecomContactService({ pool: database });
    const created = await runHermesOperation(service, { operation: "create_member_binding_qr" });
    assert.equal(created.response.status, 201);
    assert.equal(created.result.binding_qr.member_id, "member-1");
    assert.equal(created.result.binding_qr.status, "pending");
    assert.match(issuedState, /^sb_[A-Za-z0-9_-]{20}$/);

    const completed = await service.handleContactEvent({
      msgType: "event",
      event: "change_external_contact",
      changeType: "add_external_contact",
      userId: "coach-user-1",
      externalUserId: "wm-customer-1",
      state: issuedState,
    });
    assert.equal(completed.bound, true);
    assert.equal(completed.member_id, "member-1");
    assert.equal(completed.member_name, "🐻🐻君");
    assert.equal(binding.external_userid, "wm-customer-1");
    assert.equal(links.get(issuedState).status, "consumed");
    assert.equal(syncedUserName, "🐻🐻君");
    assert.equal(portalState.profile.name, "🐻🐻君");
    assert.equal(portalState.suggestions[0].member, "🐻🐻君");

    const replay = await service.handleContactEvent({
      msgType: "event",
      event: "change_external_contact",
      changeType: "add_external_contact",
      userId: "coach-user-1",
      externalUserId: "wm-customer-1",
      state: issuedState,
    });
    assert.equal(replay.idempotent_replay, true);
    assert.deepEqual(audits.map((item) => item.action), [
      "wecom_member_binding_qr_created",
      "wecom_member_binding_auto_completed",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.WECOM_CONTACT_SECRET;
  }
});
