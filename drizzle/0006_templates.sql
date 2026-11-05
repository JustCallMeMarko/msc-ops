CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"lineage_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"format" text NOT NULL,
	"file_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"previous_template_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"structure" jsonb DEFAULT '{"targets":[]}'::jsonb NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mapping_confirmed_at" timestamp with time zone,
	"warnings" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "templates_kind_check" CHECK ("templates"."kind" in ('activity_proposal', 'par', 'liquidation', 'budget_proposal', 'financial_statement', 'guest_list', 'booth_declaration', 'letter_of_explanation', 'turnover_certificate', 'resolution', 'other')),
	CONSTRAINT "templates_source_check" CHECK ("templates"."source" in ('sdao', 'scoa', 'org', 'builtin')),
	CONSTRAINT "templates_format_check" CHECK ("templates"."format" in ('docx', 'xlsx', 'pdf_form')),
	CONSTRAINT "templates_version_check" CHECK ("templates"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "packets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"kind" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	CONSTRAINT "packets_kind_check" CHECK ("packets"."kind" in ('pre_event', 'post_event', 'scoa_audit', 'renewal')),
	CONSTRAINT "packets_entity_type_check" CHECK ("packets"."entity_type" in ('event', 'term', 'org'))
);
--> statement-breakpoint
CREATE TABLE "generated_docs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"template_id" uuid NOT NULL,
	"template_version" integer NOT NULL,
	"file_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"data_hash" text NOT NULL,
	"ask_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"packet_id" uuid,
	CONSTRAINT "generated_docs_entity_type_check" CHECK ("generated_docs"."entity_type" in ('event', 'term', 'org'))
);
--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_previous_template_id_templates_id_fk" FOREIGN KEY ("previous_template_id") REFERENCES "public"."templates"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "packets" ADD CONSTRAINT "packets_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "generated_docs" ADD CONSTRAINT "generated_docs_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "generated_docs" ADD CONSTRAINT "generated_docs_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "generated_docs" ADD CONSTRAINT "generated_docs_packet_id_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."packets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "templates_lineage_active_unique" ON "templates" USING btree ("lineage_id") WHERE "templates"."active";
--> statement-breakpoint
CREATE INDEX "templates_previous_version_idx" ON "templates" USING btree ("previous_template_id","version");
--> statement-breakpoint
CREATE INDEX "templates_kind_active_idx" ON "templates" USING btree ("kind","active");
--> statement-breakpoint
CREATE INDEX "packets_entity_idx" ON "packets" USING btree ("entity_type","entity_id");
--> statement-breakpoint
CREATE INDEX "generated_docs_template_idx" ON "generated_docs" USING btree ("template_id","template_version");
--> statement-breakpoint
CREATE INDEX "generated_docs_entity_idx" ON "generated_docs" USING btree ("entity_type","entity_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "generated_docs_file_unique" ON "generated_docs" USING btree ("file_id");
