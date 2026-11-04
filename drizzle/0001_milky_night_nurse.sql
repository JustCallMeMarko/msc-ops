CREATE TABLE "committees" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"color" text DEFAULT 'blue' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"head_member_id" uuid,
	"default_checkin_days" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"committee_id" uuid,
	"contact" text DEFAULT '' NOT NULL,
	"email" text
);
--> statement-breakpoint
CREATE TABLE "task_activity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"task_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_activity_kind_check" CHECK ("task_activity"."kind" in ('comment', 'checkin_reply', 'nudge_copied', 'status_change', 'field_change', 'snooze', 'created'))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"number" serial NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"committee_id" uuid,
	"assignee_member_id" uuid,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"labels" text[] DEFAULT '{}'::text[] NOT NULL,
	"due_at" timestamp with time zone,
	"due_rule" text,
	"event_id" uuid,
	"checkin_every_days" integer,
	"next_checkin_at" timestamp with time zone,
	"last_checkin_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "tasks_number_unique" UNIQUE("number"),
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
	CONSTRAINT "tasks_priority_check" CHECK ("tasks"."priority" in ('low', 'normal', 'high', 'urgent')),
	CONSTRAINT "tasks_progress_check" CHECK ("tasks"."progress" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_member_id_members_id_fk" FOREIGN KEY ("assignee_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "committees_slug_unique" ON "committees" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "task_activity_task_at_idx" ON "task_activity" USING btree ("task_id","at");