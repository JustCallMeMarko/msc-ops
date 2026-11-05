import { sql } from "drizzle-orm";
import { bigserial, bigint, boolean, check, date, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import type { FinanceCategory, FinanceKind } from "@/lib/finance/constants";
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

export const events = pgTable("events", {
  ...commonColumns,
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  type: text("type").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  venue: text("venue").notNull().default(""),
  description: text("description").notNull().default(""),
  lumaUrl: text("luma_url"),
  participantTarget: integer("participant_target").notNull().default(0),
  participantActual: integer("participant_actual").notNull().default(0),
  approvalStatus: text("approval_status").notNull().default("draft"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  hasFees: boolean("has_fees").notNull().default(false),
  hasExternalGuests: boolean("has_external_guests").notNull().default(false),
  isMajor: boolean("is_major").notNull().default(false),
}, (table) => [
  uniqueIndex("events_slug_unique").on(table.slug),
  check("events_type_check", sql`${table.type} in ('on_campus', 'off_campus', 'online', 'booth')`),
  check("events_approval_status_check", sql`${table.approvalStatus} in ('draft', 'submitted', 'approved', 'rejected', 'cancelled')`),
  check("events_participants_check", sql`${table.participantTarget} >= 0 and ${table.participantActual} >= 0`),
]);

export const deadlineRules = pgTable("deadline_rules", {
  ...commonColumns,
  key: text("key").notNull(),
  label: text("label").notNull(),
  offsetDays: integer("offset_days").notNull(),
  dayType: text("day_type").notNull().default("calendar"),
  anchor: text("anchor").notNull().default("event_start"),
  source: text("source").notNull(),
}, (table) => [
  uniqueIndex("deadline_rules_key_unique").on(table.key),
  check("deadline_rules_day_type_check", sql`${table.dayType} in ('calendar', 'working')`),
  check("deadline_rules_anchor_check", sql`${table.anchor} in ('event_start', 'event_end')`),
]);

export const holidays = pgTable("holidays", {
  ...commonColumns,
  date: date("date", { mode: "string" }).notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
}, (table) => [
  uniqueIndex("holidays_date_unique").on(table.date),
  check("holidays_kind_check", sql`${table.kind} in ('regular', 'special')`),
]);

export const checklistItems = pgTable("checklist_items", {
  ...commonColumns,
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  phase: text("phase").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  ruleKey: text("rule_key"),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  dueOverridden: boolean("due_overridden").notNull().default(false),
  late: boolean("late").notNull().default(false),
  status: text("status").notNull().default("open"),
  source: text("source").notNull().default(""),
  sort: integer("sort").notNull().default(0),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
}, (table) => [
  index("checklist_items_event_phase_idx").on(table.eventId, table.phase, table.sort),
  check("checklist_items_phase_check", sql`${table.phase} in ('pre', 'during', 'post')`),
  check("checklist_items_status_check", sql`${table.status} in ('open', 'done', 'na')`),
]);

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
  eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
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

export const attendees = pgTable("attendees", {
  ...commonColumns,
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""), // pii
  email: text("email"), // pii
  checkedIn: boolean("checked_in").notNull().default(false),
  source: text("source").notNull().default("manual"),
}, (table) => [
  uniqueIndex("attendees_event_email_unique").on(table.eventId, sql`lower(${table.email})`).where(sql`${table.email} is not null`),
  check("attendees_source_check", sql`${table.source} in ('luma_csv', 'manual')`),
]);

export const announcementTemplates = pgTable("announcement_templates", {
  ...commonColumns,
  key: text("key").notNull(),
  name: text("name").notNull(),
  body: text("body").notNull(),
}, (table) => [uniqueIndex("announcement_templates_key_unique").on(table.key)]);

export const files = pgTable("files", {
  ...commonColumns,
  sha256: text("sha256").notNull(),
  originalName: text("original_name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  kind: text("kind").notNull().default("other"),
  source: text("source"),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  versionOf: uuid("version_of"),
  version: integer("version").notNull().default(1),
  caption: text("caption"),
}, (table) => [
  index("files_sha256_idx").on(table.sha256),
  check("files_kind_check", sql`${table.kind} in ('manual', 'cbl', 'template', 'generated', 'receipt', 'creative', 'event_photo', 'import', 'other')`),
  check("files_source_check", sql`${table.source} is null or ${table.source} in ('sdao', 'scoa', 'org', 'other')`),
]);

export const fileLinks = pgTable("file_links", {
  ...commonColumns,
  fileId: uuid("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  role: text("role").notNull().default("attachment"),
}, (table) => [
  uniqueIndex("file_links_unique").on(table.fileId, table.entityType, table.entityId, table.role),
]);

export const posts = pgTable("posts", {
  ...commonColumns,
  eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("idea"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  platforms: text("platforms").array().notNull().default(sql`'{}'::text[]`),
  artistMemberId: uuid("artist_member_id").references(() => members.id, { onDelete: "set null" }),
  writerMemberId: uuid("writer_member_id").references(() => members.id, { onDelete: "set null" }),
  reviewerMemberId: uuid("reviewer_member_id").references(() => members.id, { onDelete: "set null" }),
  brandChecked: boolean("brand_checked").notNull().default(false),
  artworkTaskId: uuid("artwork_task_id").references(() => tasks.id, { onDelete: "set null" }),
  captionTaskId: uuid("caption_task_id").references(() => tasks.id, { onDelete: "set null" }),
  ruleKey: text("rule_key"),
  scheduleOverridden: boolean("schedule_overridden").notNull().default(false),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  postUrls: jsonb("post_urls").notNull().default({}),
  analytics: jsonb("analytics").notNull().default({}),
}, (table) => [
  index("posts_event_scheduled_idx").on(table.eventId, table.scheduledAt),
  check("posts_type_check", sql`${table.type} in ('poster', 'save_the_date', 'registration_open', 'speaker_reveal', 'countdown', 'day_of', 'highlight', 'thank_you', 'reschedule_notice', 'general')`),
  check("posts_status_check", sql`${table.status} in ('idea', 'drafting', 'for_review', 'approved', 'scheduled', 'posted', 'cancelled')`),
  check("posts_platforms_check", sql`${table.platforms} <@ array['facebook', 'instagram', 'linkedin', 'x', 'tiktok']::text[]`),
]);

export const postingRules = pgTable("posting_rules", {
  ...commonColumns,
  key: text("key").notNull(),
  postType: text("post_type").notNull(),
  label: text("label").notNull(),
  offsetDays: integer("offset_days").notNull(),
  anchor: text("anchor").notNull().default("event_start"),
  enabled: boolean("enabled").notNull().default(true),
}, (table) => [
  uniqueIndex("posting_rules_key_unique").on(table.key),
  check("posting_rules_anchor_check", sql`${table.anchor} in ('event_start', 'event_end')`),
]);

export const postAssets = pgTable("post_assets", {
  ...commonColumns,
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  slideIndex: integer("slide_index").notNull().default(0),
  width: integer("width"),
  height: integer("height"),
  durationSec: integer("duration_sec"),
  note: text("note").notNull().default(""),
  isFinal: boolean("is_final").notNull().default(false),
}, (table) => [
  index("post_assets_post_version_idx").on(table.postId, table.version, table.slideIndex),
]);

export const captions = pgTable("captions", {
  ...commonColumns,
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  platform: text("platform").notNull().default("base"),
  body: text("body").notNull().default(""),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
}, (table) => [
  index("captions_post_platform_version_idx").on(table.postId, table.platform, table.version),
  check("captions_platform_check", sql`${table.platform} in ('base', 'facebook', 'instagram', 'linkedin', 'x', 'tiktok')`),
  check("captions_status_check", sql`${table.status} in ('draft', 'approved')`),
]);

export const captionTemplates = pgTable("caption_templates", {
  ...commonColumns,
  postType: text("post_type").notNull(),
  name: text("name").notNull(),
  body: text("body").notNull(),
}, (table) => [uniqueIndex("caption_templates_type_name_unique").on(table.postType, table.name)]);

export const hashtagSets = pgTable("hashtag_sets", {
  ...commonColumns,
  name: text("name").notNull(),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
}, (table) => [uniqueIndex("hashtag_sets_name_unique").on(table.name)]);

export const mentionLists = pgTable("mention_lists", {
  ...commonColumns,
  name: text("name").notNull(),
  handles: text("handles").array().notNull().default(sql`'{}'::text[]`),
}, (table) => [uniqueIndex("mention_lists_name_unique").on(table.name)]);

export const postActivity = pgTable("post_activity", {
  ...commonColumns,
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  body: text("body").notNull().default(""),
  meta: jsonb("meta").notNull().default({}),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("post_activity_post_at_idx").on(table.postId, table.at),
  check("post_activity_kind_check", sql`${table.kind} in ('comment', 'status_change', 'asset_upload', 'caption_approved')`),
]);

export const accounts = pgTable("accounts", {
  ...commonColumns,
  name: text("name").notNull(),
  kind: text("kind").$type<"bank" | "cash" | "ewallet">().notNull(),
  bankName: text("bank_name"),
  accountLast4: text("account_last4"),
  openedAt: date("opened_at", { mode: "string" }),
  signatoryMemberIds: uuid("signatory_member_ids").array().notNull().default(sql`'{}'::uuid[]`),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (table) => [
  check("accounts_kind_check", sql`${table.kind} in ('bank', 'cash', 'ewallet')`),
  check("accounts_last4_check", sql`${table.accountLast4} is null or ${table.accountLast4} ~ '^[0-9]{4}$'`),
]);

export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  seq: bigserial("seq", { mode: "number" }).notNull(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
  kind: text("kind").$type<FinanceKind>().notNull(),
  category: text("category").$type<FinanceCategory>().notNull(),
  amountCentavos: bigint("amount_centavos", { mode: "number" }).notNull(),
  occurredOn: date("occurred_on", { mode: "string" }).notNull(),
  counterparty: text("counterparty").notNull().default(""),
  description: text("description").notNull().default(""),
  orNumber: text("or_number").notNull().default(""),
  approvedByMemberId: uuid("approved_by_member_id").references(() => members.id, { onDelete: "set null" }),
  targetEntryId: uuid("target_entry_id").references((): AnyPgColumn => ledgerEntries.id, { onDelete: "restrict" }),
  replacesEntryId: uuid("replaces_entry_id").references((): AnyPgColumn => ledgerEntries.id, { onDelete: "restrict" }),
  reason: text("reason").notNull().default(""),
  prevHash: text("prev_hash").notNull().default(""),
  hash: text("hash").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("ledger_entries_seq_unique").on(table.seq),
  index("ledger_entries_account_seq_idx").on(table.accountId, table.seq),
  index("ledger_entries_event_idx").on(table.eventId),
  check("ledger_entries_kind_check", sql`${table.kind} in ('income', 'expense', 'transfer_out', 'transfer_in', 'void', 'restore')`),
  check("ledger_entries_category_check", sql`${table.category} in ('registration_fees', 'sponsorship', 'fundraising', 'merch_sales', 'dues', 'venue', 'food', 'printing', 'tokens', 'transportation', 'supplies', 'bank_fees', 'other')`),
  check("ledger_entries_amount_check", sql`${table.amountCentavos} > 0`),
  check("ledger_entries_reason_check", sql`(${table.kind} not in ('void', 'restore') and ${table.replacesEntryId} is null) or length(trim(${table.reason})) > 0`),
  check("ledger_entries_target_check", sql`(${table.kind} in ('void', 'restore')) = (${table.targetEntryId} is not null)`),
  check("ledger_entries_replaces_check", sql`(${table.replacesEntryId} is null) or length(trim(${table.reason})) > 0`),
]);

export const ledgerReceipts = pgTable("ledger_receipts", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  entryId: uuid("entry_id").notNull().references(() => ledgerEntries.id, { onDelete: "restrict" }),
  fileId: uuid("file_id").notNull().references(() => files.id, { onDelete: "restrict" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("ledger_receipts_entry_file_unique").on(table.entryId, table.fileId),
  index("ledger_receipts_entry_idx").on(table.entryId, table.removedAt),
]);

export const budgetLines = pgTable("budget_lines", {
  ...commonColumns,
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  category: text("category").$type<FinanceCategory>().notNull(),
  plannedCentavos: bigint("planned_centavos", { mode: "number" }).notNull(),
  note: text("note").notNull().default(""),
}, (table) => [
  uniqueIndex("budget_lines_event_category_unique").on(table.eventId, table.category),
  check("budget_lines_category_check", sql`${table.category} in ('registration_fees', 'sponsorship', 'fundraising', 'merch_sales', 'dues', 'venue', 'food', 'printing', 'tokens', 'transportation', 'supplies', 'bank_fees', 'other')`),
  check("budget_lines_planned_check", sql`${table.plannedCentavos} >= 0`),
]);

export const liquidations = pgTable("liquidations", {
  ...commonColumns,
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("open"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  note: text("note").notNull().default(""),
}, (table) => [
  uniqueIndex("liquidations_event_unique").on(table.eventId),
  check("liquidations_status_check", sql`${table.status} in ('open', 'submitted', 'approved')`),
]);

export const liquidationItems = pgTable("liquidation_items", {
  ...commonColumns,
  liquidationId: uuid("liquidation_id").notNull().references(() => liquidations.id, { onDelete: "cascade" }),
  entryId: uuid("entry_id").notNull().references(() => ledgerEntries.id, { onDelete: "restrict" }),
}, (table) => [
  uniqueIndex("liquidation_items_entry_unique").on(table.entryId),
  uniqueIndex("liquidation_items_liquidation_entry_unique").on(table.liquidationId, table.entryId),
]);

export const reconciliations = pgTable("reconciliations", {
  ...commonColumns,
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  statementDate: date("statement_date", { mode: "string" }).notNull(),
  statementBalanceCentavos: bigint("statement_balance_centavos", { mode: "number" }).notNull(),
  computedBalanceCentavos: bigint("computed_balance_centavos", { mode: "number" }).notNull(),
  note: text("note").notNull().default(""),
}, (table) => [
  index("reconciliations_account_date_idx").on(table.accountId, table.statementDate),
]);

export const guideProgress = pgTable("guide_progress", {
  ...commonColumns,
  guideKey: text("guide_key").notNull(),
  stepKey: text("step_key").notNull(),
  doneAt: timestamp("done_at", { withTimezone: true }),
  note: text("note").notNull().default(""),
}, (table) => [
  uniqueIndex("guide_progress_guide_step_unique").on(table.guideKey, table.stepKey),
]);

export const schema = {
  appMeta, settings, providers, networkLog, committees, members, events, deadlineRules, holidays,
  tasks, taskActivity, checklistItems, attendees, announcementTemplates, files, fileLinks,
  posts, postingRules, postAssets, captions, captionTemplates, hashtagSets, mentionLists, postActivity,
  accounts, ledgerEntries, ledgerReceipts, budgetLines, liquidations, liquidationItems, reconciliations, guideProgress,
};
