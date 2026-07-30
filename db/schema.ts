import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  role: text("role").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  plan: text("plan"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const bodyMetrics = sqliteTable("body_metrics", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  measuredAt: text("measured_at").notNull(),
  weight: real("weight").notNull(),
  bodyFat: real("body_fat").notNull(),
  muscle: real("muscle").notNull(),
  waist: real("waist").notNull(),
});

export const checkins = sqliteTable("checkins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  checkinDate: text("checkin_date").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const nutritionLogs = sqliteTable("nutrition_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  mealType: text("meal_type").notNull(),
  food: text("food").notNull(),
  calories: integer("calories").notNull(),
  protein: real("protein").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  loggedAt: text("logged_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const bookings = sqliteTable("bookings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  coachId: text("coach_id").notNull(),
  title: text("title").notNull(),
  startsAt: text("starts_at").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  model: text("model"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const aiSuggestions = sqliteTable("ai_suggestions", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),
  coachId: text("coach_id").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("draft"),
  confirmedAt: text("confirmed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  channel: text("channel").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull(),
  providerMessage: text("provider_message"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const portalState = sqliteTable("portal_state", {
  userId: text("user_id").primaryKey(),
  stateJson: text("state_json").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const memberWecomBindings = sqliteTable("member_wecom_bindings", {
  memberId: text("member_id").primaryKey(),
  externalUserid: text("external_userid").unique(),
  coachUserid: text("coach_userid").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const wecomSendTasks = sqliteTable("wecom_send_tasks", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),
  externalUserid: text("external_userid").notNull(),
  coachUserid: text("coach_userid").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("draft"),
  wecomMsgid: text("wecom_msgid"),
  providerMessage: text("provider_message"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  confirmedAt: text("confirmed_at"),
  providerUpdatedAt: text("provider_updated_at"),
});
