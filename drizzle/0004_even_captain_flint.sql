CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"bank_name" text,
	"account_last4" text,
	"opened_at" date,
	"signatory_member_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "accounts_kind_check" CHECK ("accounts"."kind" in ('bank', 'cash', 'ewallet')),
	CONSTRAINT "accounts_last4_check" CHECK ("accounts"."account_last4" is null or "accounts"."account_last4" ~ '^[0-9]{4}$')
);
--> statement-breakpoint
CREATE TABLE "budget_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"event_id" uuid NOT NULL,
	"category" text NOT NULL,
	"planned_centavos" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "budget_lines_category_check" CHECK ("budget_lines"."category" in ('registration_fees', 'sponsorship', 'fundraising', 'merch_sales', 'dues', 'venue', 'food', 'printing', 'tokens', 'transportation', 'supplies', 'bank_fees', 'other')),
	CONSTRAINT "budget_lines_planned_check" CHECK ("budget_lines"."planned_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "guide_progress" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"guide_key" text NOT NULL,
	"step_key" text NOT NULL,
	"done_at" timestamp with time zone,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"account_id" uuid NOT NULL,
	"event_id" uuid,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"occurred_on" date NOT NULL,
	"counterparty" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"or_number" text DEFAULT '' NOT NULL,
	"approved_by_member_id" uuid,
	"target_entry_id" uuid,
	"replaces_entry_id" uuid,
	"reason" text DEFAULT '' NOT NULL,
	"prev_hash" text DEFAULT '' NOT NULL,
	"hash" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_kind_check" CHECK ("ledger_entries"."kind" in ('income', 'expense', 'transfer_out', 'transfer_in', 'void', 'restore')),
	CONSTRAINT "ledger_entries_category_check" CHECK ("ledger_entries"."category" in ('registration_fees', 'sponsorship', 'fundraising', 'merch_sales', 'dues', 'venue', 'food', 'printing', 'tokens', 'transportation', 'supplies', 'bank_fees', 'other')),
	CONSTRAINT "ledger_entries_amount_check" CHECK ("ledger_entries"."amount_centavos" > 0),
	CONSTRAINT "ledger_entries_reason_check" CHECK (("ledger_entries"."kind" not in ('void', 'restore') and "ledger_entries"."replaces_entry_id" is null) or length(trim("ledger_entries"."reason")) > 0),
	CONSTRAINT "ledger_entries_target_check" CHECK (("ledger_entries"."kind" in ('void', 'restore')) = ("ledger_entries"."target_entry_id" is not null)),
	CONSTRAINT "ledger_entries_replaces_check" CHECK (("ledger_entries"."replaces_entry_id" is null) or length(trim("ledger_entries"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entry_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "liquidation_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"liquidation_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liquidations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"event_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "liquidations_status_check" CHECK ("liquidations"."status" in ('open', 'submitted', 'approved'))
);
--> statement-breakpoint
CREATE TABLE "reconciliations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"account_id" uuid NOT NULL,
	"statement_date" date NOT NULL,
	"statement_balance_centavos" bigint NOT NULL,
	"computed_balance_centavos" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_approved_by_member_id_members_id_fk" FOREIGN KEY ("approved_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_target_entry_id_ledger_entries_id_fk" FOREIGN KEY ("target_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_replaces_entry_id_ledger_entries_id_fk" FOREIGN KEY ("replaces_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_receipts" ADD CONSTRAINT "ledger_receipts_entry_id_ledger_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_receipts" ADD CONSTRAINT "ledger_receipts_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidation_items" ADD CONSTRAINT "liquidation_items_liquidation_id_liquidations_id_fk" FOREIGN KEY ("liquidation_id") REFERENCES "public"."liquidations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidation_items" ADD CONSTRAINT "liquidation_items_entry_id_ledger_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidations" ADD CONSTRAINT "liquidations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_lines_event_category_unique" ON "budget_lines" USING btree ("event_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "guide_progress_guide_step_unique" ON "guide_progress" USING btree ("guide_key","step_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_seq_unique" ON "ledger_entries" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_seq_idx" ON "ledger_entries" USING btree ("account_id","seq");--> statement-breakpoint
CREATE INDEX "ledger_entries_event_idx" ON "ledger_entries" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_receipts_entry_file_unique" ON "ledger_receipts" USING btree ("entry_id","file_id");--> statement-breakpoint
CREATE INDEX "ledger_receipts_entry_idx" ON "ledger_receipts" USING btree ("entry_id","removed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "liquidation_items_entry_unique" ON "liquidation_items" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "liquidation_items_liquidation_entry_unique" ON "liquidation_items" USING btree ("liquidation_id","entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "liquidations_event_unique" ON "liquidations" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "reconciliations_account_date_idx" ON "reconciliations" USING btree ("account_id","statement_date");--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_ledger_entry_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'ledger_entries are append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_ledger_entry_mutation();