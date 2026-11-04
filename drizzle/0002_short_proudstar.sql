CREATE TABLE "announcement_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendees" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"event_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text,
	"checked_in" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	CONSTRAINT "attendees_source_check" CHECK ("attendees"."source" in ('luma_csv', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"event_id" uuid NOT NULL,
	"phase" text NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"rule_key" text,
	"due_at" timestamp with time zone NOT NULL,
	"due_overridden" boolean DEFAULT false NOT NULL,
	"late" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"task_id" uuid,
	CONSTRAINT "checklist_items_phase_check" CHECK ("checklist_items"."phase" in ('pre', 'during', 'post')),
	CONSTRAINT "checklist_items_status_check" CHECK ("checklist_items"."status" in ('open', 'done', 'na'))
);
--> statement-breakpoint
CREATE TABLE "deadline_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"offset_days" integer NOT NULL,
	"day_type" text DEFAULT 'calendar' NOT NULL,
	"anchor" text DEFAULT 'event_start' NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "deadline_rules_day_type_check" CHECK ("deadline_rules"."day_type" in ('calendar', 'working')),
	CONSTRAINT "deadline_rules_anchor_check" CHECK ("deadline_rules"."anchor" in ('event_start', 'event_end'))
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"venue" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"luma_url" text,
	"participant_target" integer DEFAULT 0 NOT NULL,
	"participant_actual" integer DEFAULT 0 NOT NULL,
	"approval_status" text DEFAULT 'draft' NOT NULL,
	"approved_at" timestamp with time zone,
	"has_fees" boolean DEFAULT false NOT NULL,
	"has_external_guests" boolean DEFAULT false NOT NULL,
	"is_major" boolean DEFAULT false NOT NULL,
	CONSTRAINT "events_type_check" CHECK ("events"."type" in ('on_campus', 'off_campus', 'online', 'booth')),
	CONSTRAINT "events_approval_status_check" CHECK ("events"."approval_status" in ('draft', 'submitted', 'approved', 'rejected', 'cancelled')),
	CONSTRAINT "events_participants_check" CHECK ("events"."participant_target" >= 0 and "events"."participant_actual" >= 0)
);
--> statement-breakpoint
CREATE TABLE "file_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"file_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"role" text DEFAULT 'attachment' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"sha256" text NOT NULL,
	"original_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"source" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"version_of" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"caption" text,
	CONSTRAINT "files_kind_check" CHECK ("files"."kind" in ('manual', 'cbl', 'template', 'generated', 'receipt', 'creative', 'event_photo', 'import', 'other')),
	CONSTRAINT "files_source_check" CHECK ("files"."source" is null or "files"."source" in ('sdao', 'scoa', 'org', 'other'))
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "holidays_kind_check" CHECK ("holidays"."kind" in ('regular', 'special'))
);
--> statement-breakpoint
ALTER TABLE "attendees" ADD CONSTRAINT "attendees_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_links" ADD CONSTRAINT "file_links_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_templates_key_unique" ON "announcement_templates" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "attendees_event_email_unique" ON "attendees" USING btree ("event_id",lower("email")) WHERE "attendees"."email" is not null;--> statement-breakpoint
CREATE INDEX "checklist_items_event_phase_idx" ON "checklist_items" USING btree ("event_id","phase","sort");--> statement-breakpoint
CREATE UNIQUE INDEX "deadline_rules_key_unique" ON "deadline_rules" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_unique" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "file_links_unique" ON "file_links" USING btree ("file_id","entity_type","entity_id","role");--> statement-breakpoint
CREATE INDEX "files_sha256_idx" ON "files" USING btree ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "holidays_date_unique" ON "holidays" USING btree ("date");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "deadline_rules" ("id", "key", "label", "offset_days", "day_type", "anchor", "source") VALUES
	('00000000-0000-7000-8000-000000000001', 'proposal', 'Activity proposal to SDAO', -30, 'calendar', 'event_start', 'RSO Manual: Activity Proposal'),
	('00000000-0000-7000-8000-000000000002', 'offcampus_docs', 'CHED checklist and Annex A/B', -30, 'calendar', 'event_start', 'CHED Student Organization Activity Guidelines'),
	('00000000-0000-7000-8000-000000000003', 'offcampus_notarized', 'Notarized Annex A/B', -20, 'calendar', 'event_start', 'CHED Student Organization Activity Guidelines'),
	('00000000-0000-7000-8000-000000000004', 'booth_security', 'Booth security endorsement', -2, 'calendar', 'event_start', 'RSO Manual: Booth Operations'),
	('00000000-0000-7000-8000-000000000005', 'guest_list', 'External guest list to Security', -1, 'calendar', 'event_start', 'Campus Security guest-list procedure'),
	('00000000-0000-7000-8000-000000000006', 'after_hours_request', 'After-hours authorization', -7, 'calendar', 'event_start', 'RSO Manual: After-hours Activities'),
	('00000000-0000-7000-8000-000000000007', 'par', 'Post-Activity Report', 5, 'calendar', 'event_end', 'RSO Manual: Post-Activity Report'),
	('00000000-0000-7000-8000-000000000008', 'liquidation', 'SCOA liquidation', 5, 'calendar', 'event_end', 'SCOA Financial Procedures');
--> statement-breakpoint
INSERT INTO "holidays" ("id", "date", "name", "kind") VALUES
	('00000000-0000-7000-8000-000000000101', '2026-01-01', 'New Year''s Day', 'regular'),
	('00000000-0000-7000-8000-000000000102', '2026-04-02', 'Maundy Thursday', 'regular'),
	('00000000-0000-7000-8000-000000000103', '2026-04-03', 'Good Friday', 'regular'),
	('00000000-0000-7000-8000-000000000104', '2026-04-09', 'Araw ng Kagitingan', 'regular'),
	('00000000-0000-7000-8000-000000000105', '2026-05-01', 'Labor Day', 'regular'),
	('00000000-0000-7000-8000-000000000106', '2026-06-12', 'Independence Day', 'regular'),
	('00000000-0000-7000-8000-000000000107', '2026-08-31', 'National Heroes Day', 'regular'),
	('00000000-0000-7000-8000-000000000108', '2026-11-30', 'Bonifacio Day', 'regular'),
	('00000000-0000-7000-8000-000000000109', '2026-12-25', 'Christmas Day', 'regular'),
	('00000000-0000-7000-8000-000000000110', '2026-12-30', 'Rizal Day', 'regular'),
	('00000000-0000-7000-8000-000000000111', '2026-08-21', 'Ninoy Aquino Day', 'special'),
	('00000000-0000-7000-8000-000000000112', '2026-11-01', 'All Saints'' Day', 'special'),
	('00000000-0000-7000-8000-000000000113', '2026-11-02', 'All Souls'' Day', 'special'),
	('00000000-0000-7000-8000-000000000114', '2026-12-08', 'Feast of the Immaculate Conception', 'special'),
	('00000000-0000-7000-8000-000000000115', '2026-12-24', 'Christmas Eve', 'special'),
	('00000000-0000-7000-8000-000000000116', '2026-12-31', 'Last Day of the Year', 'special'),
	('00000000-0000-7000-8000-000000000201', '2027-01-01', 'New Year''s Day', 'regular'),
	('00000000-0000-7000-8000-000000000202', '2027-03-25', 'Maundy Thursday', 'regular'),
	('00000000-0000-7000-8000-000000000203', '2027-03-26', 'Good Friday', 'regular'),
	('00000000-0000-7000-8000-000000000204', '2027-04-09', 'Araw ng Kagitingan', 'regular'),
	('00000000-0000-7000-8000-000000000205', '2027-05-01', 'Labor Day', 'regular'),
	('00000000-0000-7000-8000-000000000206', '2027-06-12', 'Independence Day', 'regular'),
	('00000000-0000-7000-8000-000000000207', '2027-08-30', 'National Heroes Day', 'regular'),
	('00000000-0000-7000-8000-000000000208', '2027-11-30', 'Bonifacio Day', 'regular'),
	('00000000-0000-7000-8000-000000000209', '2027-12-25', 'Christmas Day', 'regular'),
	('00000000-0000-7000-8000-000000000210', '2027-12-30', 'Rizal Day', 'regular'),
	('00000000-0000-7000-8000-000000000211', '2027-08-21', 'Ninoy Aquino Day', 'special'),
	('00000000-0000-7000-8000-000000000212', '2027-11-01', 'All Saints'' Day', 'special'),
	('00000000-0000-7000-8000-000000000213', '2027-11-02', 'All Souls'' Day', 'special'),
	('00000000-0000-7000-8000-000000000214', '2027-12-08', 'Feast of the Immaculate Conception', 'special'),
	('00000000-0000-7000-8000-000000000215', '2027-12-24', 'Christmas Eve', 'special'),
	('00000000-0000-7000-8000-000000000216', '2027-12-31', 'Last Day of the Year', 'special');
--> statement-breakpoint
INSERT INTO "announcement_templates" ("id", "key", "name", "body") VALUES
	('00000000-0000-7000-8000-000000000301', 'save_the_date', 'Save the date', 'Save the date! {{event_name}} is happening on {{date}} at {{time}}. More details soon.'),
	('00000000-0000-7000-8000-000000000302', 'registration_open', 'Registration open', 'Registration is open for {{event_name}} on {{date}} at {{time}}. Join us at {{venue}}: {{luma_link}}'),
	('00000000-0000-7000-8000-000000000303', 't_minus_1', 'T-minus one day', 'Tomorrow is {{event_name}}! See you at {{time}} at {{venue}}. {{luma_link}}'),
	('00000000-0000-7000-8000-000000000304', 'day_of', 'Day of', 'Today: {{event_name}} at {{time}} — {{venue}}. We look forward to seeing you!'),
	('00000000-0000-7000-8000-000000000305', 'thank_you', 'Thank you', 'Thank you for joining {{event_name}}! We appreciate you being part of it.'),
	('00000000-0000-7000-8000-000000000306', 'reschedule', 'Reschedule notice', 'Please note that {{event_name}} has been rescheduled. Updated details: {{date}} at {{time}}, {{venue}}. {{luma_link}}');