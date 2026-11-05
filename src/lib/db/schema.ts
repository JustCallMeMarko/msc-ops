import { jsonb, pgTable, text, timestamp, uuid, integer, boolean } from "drizzle-orm/pg-core";
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

export const schema = { appMeta, settings, providers, networkLog };
