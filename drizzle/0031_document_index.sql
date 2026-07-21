-- Generalize drive_file_index into a school-wide document index.
--
-- Previously this table only held files synced from connected Google Drive
-- folders, so any document that lived on a board member's laptop (last year's
-- finalized Field Day packet, volunteer schedules, layout maps) was invisible
-- to the AI. Adding a source discriminator lets uploaded documents and one-off
-- Drive links land in the same index, which means every existing retrieval
-- path — event plan AI recommendations, onboarding guide generation, semantic
-- search, knowledge Q&A — picks them up with no per-feature wiring.

-- 1. How a document got here.
CREATE TYPE "public"."document_source" AS ENUM('google_drive', 'upload', 'drive_link');
--> statement-breakpoint

-- 2. Text-extraction / embedding pipeline state.
CREATE TYPE "public"."document_processing_status" AS ENUM('pending', 'ready', 'failed');
--> statement-breakpoint

-- 3. New columns. Existing rows are all Drive-synced and already processed, so
--    the defaults backfill them correctly.
ALTER TABLE "drive_file_index" ADD COLUMN "source" "document_source" DEFAULT 'google_drive' NOT NULL;--> statement-breakpoint
ALTER TABLE "drive_file_index" ADD COLUMN "blob_url" text;--> statement-breakpoint
ALTER TABLE "drive_file_index" ADD COLUMN "web_url" text;--> statement-breakpoint
ALTER TABLE "drive_file_index" ADD COLUMN "file_size" integer;--> statement-breakpoint
ALTER TABLE "drive_file_index" ADD COLUMN "school_year" text;--> statement-breakpoint
ALTER TABLE "drive_file_index" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "drive_file_index" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "drive_file_index" ADD COLUMN "processing_status" "document_processing_status" DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "drive_file_index" ADD COLUMN "processing_error" text;--> statement-breakpoint
ALTER TABLE "drive_file_index" ADD COLUMN "uploaded_by" uuid;--> statement-breakpoint
ALTER TABLE "drive_file_index" ADD COLUMN "event_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "drive_file_index" ADD COLUMN "meeting_id" uuid;--> statement-breakpoint
ALTER TABLE "drive_file_index" ADD COLUMN "knowledge_article_id" uuid;--> statement-breakpoint

-- 4. Attachment points. All ON DELETE SET NULL: deleting an event plan must not
--    destroy the institutional knowledge its documents carry — that is the whole
--    point of indexing them.
ALTER TABLE "drive_file_index" ADD CONSTRAINT "drive_file_index_uploaded_by_users_id_fk"
  FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_file_index" ADD CONSTRAINT "drive_file_index_event_plan_id_event_plans_id_fk"
  FOREIGN KEY ("event_plan_id") REFERENCES "public"."event_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_file_index" ADD CONSTRAINT "drive_file_index_meeting_id_event_plan_meetings_id_fk"
  FOREIGN KEY ("meeting_id") REFERENCES "public"."event_plan_meetings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_file_index" ADD CONSTRAINT "drive_file_index_knowledge_article_id_knowledge_articles_id_fk"
  FOREIGN KEY ("knowledge_article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- 5. Indexes for the new access patterns: listing documents by source in the
--    Knowledge Base, and pulling a plan's or meeting's attachments.
CREATE INDEX "drive_file_index_source_idx" ON "drive_file_index" USING btree ("school_id","source");--> statement-breakpoint
CREATE INDEX "drive_file_index_event_plan_idx" ON "drive_file_index" USING btree ("event_plan_id");--> statement-breakpoint
CREATE INDEX "drive_file_index_meeting_idx" ON "drive_file_index" USING btree ("meeting_id");--> statement-breakpoint

-- 6. An event plan resource can now be an uploaded document, not just a link or
--    a knowledge article. ON DELETE CASCADE here is deliberate and the opposite
--    of the above: the resource row is a pointer, so when the underlying
--    document is deleted the dangling pointer should go with it.
ALTER TABLE "event_plan_resources" ADD COLUMN "document_id" uuid;--> statement-breakpoint
ALTER TABLE "event_plan_resources" ADD CONSTRAINT "event_plan_resources_document_id_drive_file_index_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "public"."drive_file_index"("id") ON DELETE cascade ON UPDATE no action;
