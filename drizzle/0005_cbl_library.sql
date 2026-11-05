CREATE TABLE "documents" (
  "id" uuid PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "file_id" uuid NOT NULL REFERENCES "files"("id") ON DELETE RESTRICT,
  "lineage_id" uuid NOT NULL,
  "title" text NOT NULL,
  "kind" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "previous_document_id" uuid REFERENCES "documents"("id") ON DELETE RESTRICT,
  "page_count" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "error" text,
  "ocr" boolean DEFAULT false NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  CONSTRAINT "documents_kind_check" CHECK ("kind" in ('cbl', 'rso_manual', 'reference')),
  CONSTRAINT "documents_status_check" CHECK ("status" in ('queued', 'extracting', 'needs_ocr', 'chunking', 'embedding', 'ready', 'error', 'cancelled')),
  CONSTRAINT "documents_progress_check" CHECK ("progress" between 0 and 100)
);
--> statement-breakpoint
CREATE INDEX "documents_file_idx" ON "documents" ("file_id");
--> statement-breakpoint
CREATE INDEX "documents_lineage_version_idx" ON "documents" ("previous_document_id", "version");
--> statement-breakpoint
CREATE UNIQUE INDEX "documents_lineage_active_unique" ON "documents" ("lineage_id") WHERE "active";
--> statement-breakpoint
CREATE TABLE "doc_pages" (
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "page" integer NOT NULL,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "char_count" integer DEFAULT 0 NOT NULL,
  "ocr" boolean DEFAULT false NOT NULL,
  CONSTRAINT "doc_pages_page_check" CHECK ("page" > 0),
  PRIMARY KEY ("document_id", "page")
);
--> statement-breakpoint
CREATE TABLE "doc_chunks" (
  "id" uuid PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "ord" integer NOT NULL,
  "heading_path" text DEFAULT '' NOT NULL,
  "text" text NOT NULL,
  "segments" jsonb NOT NULL,
  "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce("heading_path", '') || ' ' || "text")) STORED,
  CONSTRAINT "doc_chunks_document_ord_unique" UNIQUE ("document_id", "ord")
);
--> statement-breakpoint
CREATE INDEX "doc_chunks_document_idx" ON "doc_chunks" ("document_id");
--> statement-breakpoint
CREATE INDEX "doc_chunks_tsv_gin_idx" ON "doc_chunks" USING GIN ("tsv");
--> statement-breakpoint
CREATE TABLE "chunk_embeddings" (
  "id" uuid PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "chunk_id" uuid NOT NULL REFERENCES "doc_chunks"("id") ON DELETE CASCADE,
  "model_key" text NOT NULL,
  "dims" integer NOT NULL,
  "embedding" vector NOT NULL,
  CONSTRAINT "chunk_embeddings_chunk_model_unique" UNIQUE ("chunk_id", "model_key")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
  "id" uuid PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "kind" text NOT NULL,
  "ref_id" uuid NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "error" text,
  "cancel_requested" boolean DEFAULT false NOT NULL,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  CONSTRAINT "jobs_status_check" CHECK ("status" in ('queued', 'running', 'ready', 'error', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX "jobs_status_created_idx" ON "jobs" ("status", "created_at");
--> statement-breakpoint
CREATE TABLE "chat_threads" (
  "id" uuid PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "scope" text NOT NULL,
  "scope_ref" text,
  "title" text DEFAULT 'New conversation' NOT NULL,
  CONSTRAINT "chat_threads_scope_check" CHECK ("scope" in ('cbl', 'finance', 'general'))
);
--> statement-breakpoint
CREATE INDEX "chat_threads_scope_updated_idx" ON "chat_threads" ("scope", "updated_at");
--> statement-breakpoint
CREATE TABLE "chat_messages" (
  "id" uuid PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "thread_id" uuid NOT NULL REFERENCES "chat_threads"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "doc_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "model_key" text,
  "partial" boolean DEFAULT false NOT NULL,
  CONSTRAINT "chat_messages_role_check" CHECK ("role" in ('system', 'user', 'assistant'))
);
--> statement-breakpoint
CREATE INDEX "chat_messages_thread_created_idx" ON "chat_messages" ("thread_id", "created_at");
