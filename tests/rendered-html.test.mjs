import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("builds the member portal without starter artifacts", async () => {
  const [page, portal, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/fitness-portal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /FitnessPortal/);
  assert.match(portal, /邵教练专属会员平台/);
  assert.match(portal, /训练计划/);
  assert.doesNotMatch(`${page}${portal}${packageJson}`, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("includes coach approval, native agent and WeCom AI Bot tooling", async () => {
  const [coach, admin, assistant, envExample, tools, contact] = await Promise.all([
    readFile(new URL("../components/coach-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/management-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/assistant-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../server/hermes_tools_mcp.py", import.meta.url), "utf8"),
    readFile(new URL("../server/wecom-contact.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(coach, /会员档案/);
  assert.match(coach, /训练方案设计/);
  assert.match(assistant, /AI 智能教练/);
  assert.match(envExample, /DEEPSEEK_MODEL=deepseek-v4-flash/);
  assert.match(admin, /企业微信 AI 助理/);
  assert.match(tools, /get_member_by_id/);
  assert.match(contact, /externalcontact\/add_msg_template/);
  assert.match(contact, /发送任务已创建，请在企业微信客户端确认发送。/);
  assert.doesNotMatch(`${assistant}${contact}`, /notifications\/weixin|WECOM_WEBHOOK_URL/);
});

test("removes member booking and gives the coach interactive schedule control", async () => {
  const [portal, memberViews, bookingPage, coach, server] = await Promise.all([
    readFile(new URL("../components/fitness-portal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/member-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/booking/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/coach-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/index.mjs", import.meta.url), "utf8"),
  ]);
  const memberNavBlock = portal.slice(portal.indexOf("const memberNav"), portal.indexOf("const coachNav"));
  assert.doesNotMatch(memberNavBlock, /assistant|Hermes|智能助理|课程预约|booking/);
  assert.doesNotMatch(memberViews, /export function BookingView/);
  assert.match(memberViews, /由教练统一排期/);
  assert.match(bookingPage, /redirect\("\/"\)/);
  assert.match(coach, /新增课程/);
  assert.match(coach, /deleteCoachBooking/);
  assert.match(coach, /coach-training/);
  assert.match(coach, /coach-nutrition/);
  assert.match(coach, /coach-body/);
  assert.match(server, /coach_booking_add/);
  assert.match(server, /coach_booking_delete/);
  assert.match(server, /Hermes AI 助理仅供教练账号使用/);
});

test("adds interactive charts, distinct admin sections, and Hermes website management tools", async () => {
  const [ui, portal, admin, assistant, tools, contact, layout] = await Promise.all([
    readFile(new URL("../components/ui.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/fitness-portal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/management-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/assistant-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/hermes_tools_mcp.py", import.meta.url), "utf8"),
    readFile(new URL("../server/wecom-contact.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(ui, /trend-tooltip/);
  assert.match(ui, /onMouseEnter/);
  assert.match(portal, /admin-notifications/);
  assert.match(portal, /admin-users/);
  assert.match(portal, /admin-settings/);
  assert.match(portal, /admin-ai/);
  assert.match(admin, /管理账户/);
  assert.match(admin, /saveManagedUser/);
  assert.doesNotMatch(assistant, /assistant-flow/);
  for (const operation of ["add_private_session", "delete_private_session", "update_training_plan", "update_nutrition_plan", "add_body_feedback", "update_member_profile"]) {
    assert.match(tools, new RegExp(operation));
    assert.match(contact, new RegExp(operation));
  }
  assert.doesNotMatch(`${portal}${admin}${assistant}${layout}`, /\u6b66\u6c49|Wuhan|wuhan/);
  assert.doesNotMatch(`${portal}${admin}`, />\s*同步数据\s*</);
});

test("keeps mainland deployment and secret configuration documented", async () => {
  const [envExample, compose, readme] = await Promise.all([
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../docker-compose.yml", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);
  assert.match(envExample, /DEEPSEEK_API_KEY/);
  assert.match(envExample, /HERMES_API_KEY/);
  assert.match(envExample, /WECOM_CONTACT_SECRET/);
  assert.match(envExample, /WECOM_ALLOWED_COACH_USERIDS/);
  assert.match(compose, /Asia\/Shanghai/);
  assert.match(readme, /ICP\s*备案/);
});

test("documents one Hermes instance and denies nickname-based member matching", async () => {
  const [readme, soul, tools] = await Promise.all([
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../deployment/hermes-wecom-soul.md", import.meta.url), "utf8"),
    readFile(new URL("../server/hermes_tools_mcp.py", import.meta.url), "utf8"),
  ]);
  assert.match(readme, /唯一实例/);
  assert.match(readme, /不使用 OpenClaw、ClawBot、iLink/);
  assert.match(soul, /禁止用姓名、企业微信昵称、普通微信昵称/);
  assert.match(tools, /不得把任务创建或企业微信报告已发送表述为会员已收到/);
});

test("supports safe member self-registration and automatic sign-in", async () => {
  const [server, portal] = await Promise.all([
    readFile(new URL("../server/index.mjs", import.meta.url), "utf8"),
    readFile(new URL("../components/fitness-portal.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(server, /\/api\/auth\/register/);
  assert.match(server, /role,password_hash,status\) VALUES \(\$1,\$2,\$3,'member'/);
  assert.match(server, /self_register/);
  assert.match(server, /issueSession\(response, \{ id, name, role: "member" \}, 201\)/);
  assert.match(portal, /还没有账号？立即注册/);
  assert.match(portal, /注册并进入平台/);
  assert.match(portal, /用户协议/);
});

test("ships the final responsive member polish and simplified admin navigation", async () => {
  const [memberViews, portal, admin, css] = await Promise.all([
    readFile(new URL("../components/member-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/fitness-portal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/management-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  for (const className of ["weekly-goals-card", "coach-advice-card", "training-rhythm-card", "hydration-card", "measurement-guide-card"]) {
    assert.match(memberViews, new RegExp(className));
    assert.match(css, new RegExp(`\\.${className}`));
  }
  const adminNavBlock = portal.slice(portal.indexOf("const adminNav"), portal.indexOf("export function FitnessPortal"));
  assert.doesNotMatch(adminNavBlock, /教练运营/);
  assert.doesNotMatch(adminNavBlock, /\/coach\/schedule/);
  assert.match(admin, /admin-settings-layout/);
  assert.match(admin, /integration-status-grid/);
  assert.match(admin, /fetch\("\/health"/);
  assert.match(admin, /hermesMemberTools/);
  assert.match(admin, /wecomContact/);
  assert.match(admin, /IntegrationBadge/);
  assert.match(css, /\.integration-status-grid em\.warning/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /\.admin-settings-layout \{ grid-template-columns: 1fr; \}/);
});

test("separates administrator and coach accounts, portals, and permissions", async () => {
  const [portal, server, adminView, css, adminLoginRoute, coachLoginRoute] = await Promise.all([
    readFile(new URL("../components/fitness-portal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/index.mjs", import.meta.url), "utf8"),
    readFile(new URL("../components/management-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/coach/login/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(portal, /expected_role: requestedRole/);
  assert.doesNotMatch(portal, /requestedRole === "coach" && result\.user\.role === "admin"/);
  assert.match(portal, /管理端独立登录/);
  assert.match(portal, /教练端独立登录/);
  assert.match(portal, /系统管理员/);
  assert.match(server, /user\.role !== expectedRole/);
  assert.match(server, /managementAction && session\.role !== "coach"/);
  assert.match(server, /if \(session\.role !== "coach"\)/);
  assert.match(server, /WHERE role='member'/);
  assert.match(adminView, /name: "系统管理员", role: "管理员"/);
  assert.match(adminView, /name: "邵教练", role: "教练"/);
  assert.match(css, /\.admin-login-page \.login-brand-panel/);
  assert.match(css, /\.coach-login-page \.login-brand-panel/);
  assert.match(adminLoginRoute, /initialView="admin"/);
  assert.match(coachLoginRoute, /initialView="coach"/);
});
