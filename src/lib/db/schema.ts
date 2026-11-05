import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { commonColumns } from "./columns";

export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providers = pgTable("providers", {
  ...commonColumns,
  name: text("name").notNull(),
  type: text("type").notNull(),
  baseUrl: text("base_url").notNull(),
  apiKeyEnc: text("api_key_enc"),
  apiKeyLast4: text("api_key_last4"),
});

export const networkLog = pgTable("network_log", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  host: text("host").notNull(),
  method: text("method").notNull(),
  path: text("path").notNull(),
  purpose: text("purpose").notNull(),
  status: integer("status"),
  blocked: boolean("blocked").notNull().default(false),
  bytesOut: integer("bytes_out").notNull().default(0),
  bytesIn: integer("bytes_in").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
});

export const committees = pgTable("committees", {
  ...commonColumns,
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  color: text("color").notNull().default("blue"),
  description: text("description").notNull().default(""),
  headMemberId: uuid("head_member_id"),
  defaultCheckinDays: integer("default_checkin_days").notNull().default(3),
}, (table) => [
  uniqueIndex("committees_slug_unique").on(table.slug),
]);

export const members = pgTable("members", {
  ...commonColumns,
  name: text("name").notNull(), // pii
  role: text("role").notNull().default(""),
  committeeId: uuid("committee_id").references(() => committees.id, { onDelete: "set null" }),
  contact: text("contact").notNull().default(""), // pii
  email: text("email"), // pii
});

export const tasks = pgTable("tasks", {
  ...commonColumns,
  number: serial("number").notNull().unique(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  committeeId: uuid("committee_id").references(() => committees.id, { onDelete: "set null" }),
  assigneeMemberId: uuid("assignee_member_id").references(() => members.id, { onDelete: "set null" }),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("normal"),
  progress: integer("progress").notNull().default(0),
  labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
  dueAt: timestamp("due_at", { withTimezone: true }),
  dueRule: text("due_rule"),
  eventId: uuid("event_id"),
  checkinEveryDays: integer("checkin_every_days"),
  nextCheckinAt: timestamp("next_checkin_at", { withTimezone: true }),
  lastCheckinAt: timestamp("last_checkin_at", { withTimezone: true }),
  snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  check("tasks_status_check", sql`${table.status} in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')`),
  check("tasks_priority_check", sql`${table.priority} in ('low', 'normal', 'high', 'urgent')`),
  check("tasks_progress_check", sql`${table.progress} between 0 and 100`),
]);

export const taskActivity = pgTable("task_activity", {
  ...commonColumns,
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  body: text("body").notNull().default(""),
  meta: jsonb("meta").notNull().default({}),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("task_activity_task_at_idx").on(table.taskId, table.at),
  check("task_activity_kind_check", sql`${table.kind} in ('comment', 'checkin_reply', 'nudge_copied', 'status_change', 'field_change', 'snooze', 'created')`),
]);

export const schema = { appMeta, settings, providers, networkLog, committees, members, tasks, taskActivity };
