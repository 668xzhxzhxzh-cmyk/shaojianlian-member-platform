import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

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

try {
  const [messages, conversations] = await Promise.all([
    pool.query(
      `SELECT msg_id,msg_type,status,result,attempt_count,created_at,updated_at
       FROM wecom_customer_messages
       ORDER BY created_at DESC LIMIT 20`,
    ),
    pool.query("SELECT COUNT(*)::int AS count,MAX(updated_at) AS latest_at FROM wecom_customer_conversations"),
  ]);
  console.log(JSON.stringify({
    ok: true,
    messages: messages.rows.map((row) => ({
      messageHash: createHash("sha256").update(String(row.msg_id)).digest("hex").slice(0, 12),
      type: row.msg_type,
      status: row.status,
      result: row.result || null,
      attempts: Number(row.attempt_count || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    conversations: conversations.rows[0] || { count: 0, latest_at: null },
  }));
} finally {
  await pool.end();
}
