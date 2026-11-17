import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { promisify } from "node:util";

const [envFile, releaseDir] = process.argv.slice(2);
if (!envFile || !releaseDir) throw new Error("status inspection paths are required");

let databaseUrl = "";
for (const line of (await readFile(envFile, "utf8")).split(/\r?\n/)) {
  const separator = line.indexOf("=");
  if (separator < 1 || line.slice(0, separator).trim() !== "DATABASE_URL") continue;
  databaseUrl = line.slice(separator + 1).trim();
  break;
}
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

const requireFromRelease = createRequire(`${releaseDir}/package.json`);
const { Pool } = requireFromRelease("pg");
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const execFileAsync = promisify(execFile);

async function inspectCallbackAccess() {
  const text = await readFile("/var/log/nginx/access.log", "utf8").catch(() => "");
  return text
    .split(/\r?\n/)
    .slice(-5000)
    .map((line) => {
      const match = line.match(/\[([^\]]+)\]\s+"POST\s+\/api\/wecom\/callback(?:\?[^\s]*)?\s+HTTP\/[^"]+"\s+(\d{3})\b/);
      return match ? { at: match[1], status: Number(match[2]) } : null;
    })
    .filter(Boolean)
    .slice(-20);
}

async function inspectCallbackRoute() {
  const text = await readFile("/etc/nginx/sites-enabled/shao-coach", "utf8").catch(() => "");
  const exact = /location\s*=\s*\/api\/wecom\/callback\b/.test(text);
  const api = text.match(/location\s+\/api\/\s*\{([^]*?)\n\s*\}/);
  const upstream = String(api?.[1] || "").match(/proxy_pass\s+http:\/\/127\.0\.0\.1:(\d+)/);
  return { exactLocation: exact, apiUpstreamPort: upstream ? Number(upstream[1]) : null };
}

async function inspectCallbackErrors() {
  const { stdout = "" } = await execFileAsync("journalctl", [
    "--unit=shao-api.service",
    "--since=12 hours ago",
    "--no-pager",
    "--output=cat",
  ], { maxBuffer: 2 * 1024 * 1024 }).catch(() => ({ stdout: "" }));
  return stdout
    .split(/\r?\n/)
    .flatMap((line) => {
      try {
        const entry = JSON.parse(line);
        if (entry?.integration !== "wecom_customer_service_callback") return [];
        return [{
          level: String(entry.level || "error").slice(0, 20),
          integration: "wecom_customer_service_callback",
          errorCategory: categorizeError(entry.message),
        }];
      } catch {
        return [];
      }
    })
    .slice(-20);
}

function categorizeError(message) {
  const value = String(message || "");
  if (/errcode=\d+/i.test(value)) return value.match(/errcode=\d+/i)[0].toLowerCase();
  if (/invalid input syntax.*json|malformed array literal/i.test(value)) return "conversation_json";
  if (/provider=/i.test(value)) return "model_provider";
  if (/duplicate key|foreign key|not-null/i.test(value)) return "database_constraint";
  if (/access_token/i.test(value)) return "access_token";
  if (/客服账号|open_kfid/i.test(value)) return "account_mismatch";
  if (/同步 Token/i.test(value)) return "sync_token";
  if (/会员|绑定/i.test(value)) return "member_binding";
  if (/timeout|timed out|abort/i.test(value)) return "timeout";
  return "internal_error";
}

try {
  const [messages, conversations, callbackAccess, callbackErrors, callbackRoute] = await Promise.all([
    pool.query(
      `SELECT msg_id,msg_type,status,result,attempt_count,error_message,sent_at,created_at,updated_at
       FROM wecom_customer_messages
       ORDER BY created_at DESC LIMIT 20`,
    ),
    pool.query("SELECT COUNT(*)::int AS count,MAX(updated_at) AS latest_at FROM wecom_customer_conversations"),
    inspectCallbackAccess(),
    inspectCallbackErrors(),
    inspectCallbackRoute(),
  ]);
  console.log(JSON.stringify({
    ok: true,
    messages: messages.rows.map((row) => ({
      messageHash: createHash("sha256").update(String(row.msg_id)).digest("hex").slice(0, 12),
      type: row.msg_type,
      status: row.status,
      result: row.result || null,
      attempts: Number(row.attempt_count || 0),
      sent: Boolean(row.sent_at),
      errorCategory: row.error_message ? categorizeError(row.error_message) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    conversations: conversations.rows[0] || { count: 0, latest_at: null },
    callbackAccess,
    callbackErrors,
    callbackRoute,
  }));
} finally {
  await pool.end();
}
