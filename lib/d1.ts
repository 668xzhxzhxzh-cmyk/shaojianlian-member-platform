import { env } from "@/lib/cloudflare-env";
import { demoState, type PortalState } from "./portal-data";

const USER_ID = "member-li";

function getDatabase() {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) throw new Error("D1 database binding is unavailable");
  return database;
}

export async function ensureDatabase() {
  const db = getDatabase();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL,
      plan TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS body_metrics (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, measured_at TEXT NOT NULL,
      weight REAL NOT NULL, body_fat REAL NOT NULL, muscle REAL NOT NULL, waist REAL NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, checkin_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, checkin_date)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS nutrition_logs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, meal_type TEXT NOT NULL, food TEXT NOT NULL,
      calories INTEGER NOT NULL, protein REAL NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      logged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, coach_id TEXT NOT NULL, title TEXT NOT NULL,
      starts_at TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
      model TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_suggestions (
      id TEXT PRIMARY KEY, member_id TEXT NOT NULL, coach_id TEXT NOT NULL, category TEXT NOT NULL,
      title TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
      confirmed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, channel TEXT NOT NULL, title TEXT NOT NULL,
      content TEXT NOT NULL, status TEXT NOT NULL, provider_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS portal_state (
      user_id TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS body_metrics_user_date_idx ON body_metrics(user_id, measured_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS chat_messages_user_date_idx ON chat_messages(user_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS notifications_user_date_idx ON notifications(user_id, created_at)"),
  ]);

  await db
    .prepare("INSERT OR IGNORE INTO users (id, role, name, phone, plan) VALUES (?, 'member', ?, ?, ?)")
    .bind(USER_ID, demoState.profile.name, demoState.profile.phone, demoState.profile.plan)
    .run();
  await db
    .prepare("INSERT OR IGNORE INTO portal_state (user_id, state_json) VALUES (?, ?)")
    .bind(USER_ID, JSON.stringify(demoState))
    .run();
  return db;
}

export async function getPortalState(): Promise<PortalState> {
  const db = await ensureDatabase();
  const row = await db.prepare("SELECT state_json FROM portal_state WHERE user_id = ?").bind(USER_ID).first<{ state_json: string }>();
  if (!row) return demoState;
  try {
    return JSON.parse(row.state_json) as PortalState;
  } catch {
    return demoState;
  }
}

export async function savePortalState(state: PortalState) {
  const db = await ensureDatabase();
  await db
    .prepare("INSERT INTO portal_state (user_id, state_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP")
    .bind(USER_ID, JSON.stringify(state))
    .run();
  return db;
}

export const portalUserId = USER_ID;
