import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("CI runs quality gates in order and packages only on GitHub Runner", async () => {
  const ci = await read(".github/workflows/ci.yml");
  const markers = [
    "run: npm ci",
    "run: npm run lint",
    "run: npm run typecheck",
    "run: npm test",
    "run: npm run build:node",
    "run: bash scripts/package-production.sh",
    "Dry-run release controller without production access",
    "uses: actions/upload-artifact@v7",
  ];
  let previous = -1;
  for (const marker of markers) {
    const position = ci.indexOf(marker);
    assert.ok(position > previous, `${marker} must exist after the previous CI gate`);
    previous = position;
  }
  assert.match(ci, /name: shao-production-linux-\$\{\{ github\.sha \}\}/);
  assert.match(ci, /retention-days: 14/);
});

test("production deploy is manual, CI-gated and never builds on Aliyun", async () => {
  const deploy = await read(".github/workflows/deploy.yml");
  assert.match(deploy, /workflow_dispatch:/);
  assert.match(deploy, /confirm_production:/);
  assert.match(deploy, /inputs\.confirm_production == 'DEPLOY'/);
  assert.match(deploy, /environment: production/);
  assert.match(deploy, /bash scripts\/resolve-ci-artifact\.sh/);
  assert.match(deploy, /printf '%s\\n' "\$GH_TOKEN" \| ssh/);
  assert.match(deploy, /--token-stdin/);
  assert.doesNotMatch(deploy, /npm (?:ci|install|run build)/);
  assert.doesNotMatch(deploy, /git pull/);
});

test("release controller verifies, stages, health-checks and rolls back", async () => {
  const [controller, packageScript, webService, apiService] = await Promise.all([
    read("scripts/release-deploy.sh"),
    read("scripts/package-production.sh"),
    read("deployment/shao-web.service"),
    read("deployment/shao-api.service"),
  ]);

  assert.match(controller, /sha256sum -c -/);
  assert.match(controller, /sha256sum -c "\$\(basename "\$inner_checksum"\)"/);
  assert.match(controller, /releases\/\$release_sha/);
  assert.match(controller, /API_PORT=8988/);
  assert.match(controller, /PORT=3300/);
  assert.match(controller, /scripts\/backup-postgres\.sh/);
  assert.match(controller, /enable --now shao-backup\.timer/);
  assert.match(controller, /enable --now hermes-desktop-watchdog\.timer/);
  assert.match(controller, /hermes-desktop-watchdog\.sh" --repair/);
  assert.match(controller, /atomic_link "\$release_dir" "\$base_dir\/current"/);
  assert.match(controller, /新版本验证失败，正在自动恢复旧版本/);
  assert.match(controller, /release_dirs/);
  assert.match(packageScript, /npm ci --prefix "\$stage\/release" --omit=dev/);
  assert.match(packageScript, /scripts\/backup-postgres\.sh/);
  assert.match(packageScript, /scripts\/hermes-desktop-watchdog\.sh/);
  assert.match(packageScript, /cp -a "\$repo_root\/lib" "\$stage\/release\/lib"/);
  assert.match(packageScript, /运行包疑似包含真实密钥/);
  assert.match(webService, /\/opt\/shao-coach\/current\/web\/server\.js/);
  assert.match(apiService, /\/opt\/shao-coach\/current\/server\/index\.mjs/);
});

test("production package includes the real Hermes vision probe", async () => {
  const packageScript = await read("scripts/package-production.sh");
  const archiveVerification = await read("scripts/verify-release-archive.sh");
  const runtimeConfiguration = await read("scripts/configure-production-runtime.sh");
  assert.match(packageScript, /verify-vision-runtime\.mjs/);
  assert.match(archiveVerification, /verify-vision-runtime\.mjs/);
  assert.match(runtimeConfiguration, /verify-vision-runtime\.mjs/);
});

test("production WeChat status inspection is read-only and sanitized", async () => {
  const deploy = await read(".github/workflows/deploy.yml");
  const inspector = await read("scripts/inspect-wecom-customer-status.mjs");
  assert.match(deploy, /VERIFY_WECOM/);
  assert.match(deploy, /verify-wecom:/);
  assert.match(inspector, /SELECT msg_id,msg_type,status,result,attempt_count,error_message,sent_at,created_at,updated_at/);
  assert.match(inspector, /wecom_customer_service_callback/);
  assert.match(inspector, /\/var\/log\/nginx\/access\.log/);
  assert.match(inspector, /journalctl/);
  assert.match(inspector, /apiUpstreamPort/);
  assert.doesNotMatch(inspector, /SELECT[^;]*(?:external_userid|member_id|turns_json|payload_json)/i);
  assert.doesNotMatch(inspector, /callbackAccess[^]*msg_signature/i);
  assert.doesNotMatch(
    inspector,
    /\b(?:INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|TRUNCATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b/i,
  );
});

test("production routes the only WeCom callback through the website API", async () => {
  const [deploy, route, packageScript, archiveVerification] = await Promise.all([
    read(".github/workflows/deploy.yml"),
    read("scripts/configure-wecom-callback-route.sh"),
    read("scripts/package-production.sh"),
    read("scripts/verify-release-archive.sh"),
  ]);
  assert.match(deploy, /configure-wecom-callback-route\.sh/);
  assert.match(deploy, /Route WeChat customer-service callbacks to the website API/);
  assert.match(route, /BEGIN SHAO HERMES WECOM CALLBACK/);
  assert.match(route, /127\.0\.0\.1:8788/);
  assert.match(route, /restore_route/);
  assert.match(route, /nginx -t/);
  assert.match(route, /callback_status/);
  assert.match(packageScript, /configure-wecom-callback-route\.sh/);
  assert.match(archiveVerification, /configure-wecom-callback-route\.sh/);
});

test("project Skill and AGENTS rules require verification before completion", async () => {
  const [skill, agents, flow, checklist] = await Promise.all([
    read(".agents/skills/safe-web-release/SKILL.md"),
    read("AGENTS.md"),
    read(".agents/skills/safe-web-release/references/deployment-flow.md"),
    read(".agents/skills/safe-web-release/references/checklist.md"),
  ]);

  assert.match(skill, /^---\nname: safe-web-release\n/m);
  assert.match(skill, /读取仓库根目录 `AGENTS\.md`/);
  assert.match(skill, /未经用户确认不得运行第一次新工作流正式部署/);
  assert.match(agents, /禁止在生产服务器执行 `npm ci`、`npm install`、`npm run build`/);
  assert.match(agents, /未经实际验证不得使用“部署成功”/);
  assert.match(flow, /已经真实成功的流程/);
  assert.match(flow, /待确认/);
  assert.match(checklist, /SHA-256/);
});
