CREATE TABLE "caption_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"post_type" text NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "captions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"post_id" uuid NOT NULL,
	"platform" text DEFAULT 'base' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_at" timestamp with time zone,
	CONSTRAINT "captions_platform_check" CHECK ("captions"."platform" in ('base', 'facebook', 'instagram', 'linkedin', 'x', 'tiktok')),
	CONSTRAINT "captions_status_check" CHECK ("captions"."status" in ('draft', 'approved'))
);
--> statement-breakpoint
CREATE TABLE "hashtag_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mention_lists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"handles" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_activity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"post_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_activity_kind_check" CHECK ("post_activity"."kind" in ('comment', 'status_change', 'asset_upload', 'caption_approved'))
);
--> statement-breakpoint
CREATE TABLE "post_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"post_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"slide_index" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"duration_sec" integer,
	"note" text DEFAULT '' NOT NULL,
	"is_final" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posting_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"key" text NOT NULL,
	"post_type" text NOT NULL,
	"label" text NOT NULL,
	"offset_days" integer NOT NULL,
	"anchor" text DEFAULT 'event_start' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "posting_rules_anchor_check" CHECK ("posting_rules"."anchor" in ('event_start', 'event_end'))
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"event_id" uuid,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'idea' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"platforms" text[] DEFAULT '{}'::text[] NOT NULL,
	"artist_member_id" uuid,
	"writer_member_id" uuid,
	"reviewer_member_id" uuid,
	"brand_checked" boolean DEFAULT false NOT NULL,
	"artwork_task_id" uuid,
	"caption_task_id" uuid,
	"rule_key" text,
	"schedule_overridden" boolean DEFAULT false NOT NULL,
	"posted_at" timestamp with time zone,
	"post_urls" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"analytics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "posts_type_check" CHECK ("posts"."type" in ('poster', 'save_the_date', 'registration_open', 'speaker_reveal', 'countdown', 'day_of', 'highlight', 'thank_you', 'reschedule_notice', 'general')),
	CONSTRAINT "posts_status_check" CHECK ("posts"."status" in ('idea', 'drafting', 'for_review', 'approved', 'scheduled', 'posted', 'cancelled')),
	CONSTRAINT "posts_platforms_check" CHECK ("posts"."platforms" <@ array['facebook', 'instagram', 'linkedin', 'x', 'tiktok']::text[])
);
--> statement-breakpoint
ALTER TABLE "captions" ADD CONSTRAINT "captions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_activity" ADD CONSTRAINT "post_activity_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_assets" ADD CONSTRAINT "post_assets_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_assets" ADD CONSTRAINT "post_assets_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_artist_member_id_members_id_fk" FOREIGN KEY ("artist_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_writer_member_id_members_id_fk" FOREIGN KEY ("writer_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_reviewer_member_id_members_id_fk" FOREIGN KEY ("reviewer_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_artwork_task_id_tasks_id_fk" FOREIGN KEY ("artwork_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_caption_task_id_tasks_id_fk" FOREIGN KEY ("caption_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "caption_templates_type_name_unique" ON "caption_templates" USING btree ("post_type","name");--> statement-breakpoint
CREATE INDEX "captions_post_platform_version_idx" ON "captions" USING btree ("post_id","platform","version");--> statement-breakpoint
CREATE UNIQUE INDEX "hashtag_sets_name_unique" ON "hashtag_sets" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "mention_lists_name_unique" ON "mention_lists" USING btree ("name");--> statement-breakpoint
CREATE INDEX "post_activity_post_at_idx" ON "post_activity" USING btree ("post_id","at");--> statement-breakpoint
CREATE INDEX "post_assets_post_version_idx" ON "post_assets" USING btree ("post_id","version","slide_index");--> statement-breakpoint
CREATE UNIQUE INDEX "posting_rules_key_unique" ON "posting_rules" USING btree ("key");--> statement-breakpoint
CREATE INDEX "posts_event_scheduled_idx" ON "posts" USING btree ("event_id","scheduled_at");
--> statement-breakpoint
INSERT INTO "posting_rules" ("id", "key", "post_type", "label", "offset_days", "anchor", "enabled") VALUES
	('00000000-0000-7000-8000-000000000201', 'poster', 'poster', 'Main event poster', -21, 'event_start', true),
	('00000000-0000-7000-8000-000000000202', 'registration_open', 'registration_open', 'Registration opens', -21, 'event_start', true),
	('00000000-0000-7000-8000-000000000203', 'speaker_reveal', 'speaker_reveal', 'Speaker reveal', -14, 'event_start', true),
	('00000000-0000-7000-8000-000000000204', 'countdown_7', 'countdown', '7 days to go', -7, 'event_start', true),
	('00000000-0000-7000-8000-000000000205', 'countdown_3', 'countdown', '3 days to go', -3, 'event_start', true),
	('00000000-0000-7000-8000-000000000206', 'countdown_1', 'countdown', 'Tomorrow', -1, 'event_start', true),
	('00000000-0000-7000-8000-000000000207', 'day_of', 'day_of', 'Event day', 0, 'event_start', true),
	('00000000-0000-7000-8000-000000000208', 'highlight', 'highlight', 'Event highlights', 2, 'event_end', true),
	('00000000-0000-7000-8000-000000000209', 'thank_you', 'thank_you', 'Thank you', 3, 'event_end', true);
--> statement-breakpoint
INSERT INTO "caption_templates" ("id", "post_type", "name", "body") VALUES
	('00000000-0000-7000-8000-000000000301', 'poster', 'Event poster', '{{event_name}} is coming up on {{date}} at {{venue}}. Save the date!'),
	('00000000-0000-7000-8000-000000000302', 'save_the_date', 'Save the date', 'Save the date: {{event_name}} · {{date}} · {{venue}}'),
	('00000000-0000-7000-8000-000000000303', 'registration_open', 'Registration open', 'Registration is open for {{event_name}}! Join us {{date}}. {{luma_link}}'),
	('00000000-0000-7000-8000-000000000304', 'speaker_reveal', 'Speaker reveal', 'Meet {{speaker}} at {{event_name}} on {{date}}.'),
	('00000000-0000-7000-8000-000000000305', 'countdown', 'Countdown', '{{days_left}} days to go! See you at {{event_name}} on {{date}}.'),
	('00000000-0000-7000-8000-000000000306', 'day_of', 'Event day', 'It is event day! Join us at {{venue}} for {{event_name}}.'),
	('00000000-0000-7000-8000-000000000307', 'highlight', 'Highlights', 'Thank you for being part of {{event_name}}. We welcomed {{attendance}} attendees!'),
	('00000000-0000-7000-8000-000000000308', 'thank_you', 'Thank you', 'Thank you for making {{event_name}} special!'),
	('00000000-0000-7000-8000-000000000309', 'reschedule_notice', 'Reschedule notice', '{{event_name}} has been rescheduled. We will share the new date soon.'),
	('00000000-0000-7000-8000-000000000310', 'general', 'General post', '{{event_name}} · {{date}} · {{venue}}');