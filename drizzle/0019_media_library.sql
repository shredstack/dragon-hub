-- Media Library table for reusable images across the app
CREATE TABLE IF NOT EXISTS "media_library" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "blob_url" text NOT NULL,
  "file_name" text NOT NULL,
  "file_size" integer,
  "mime_type" text,
  "alt_text" text,
  "tags" text[],
  "reusable" boolean DEFAULT true NOT NULL,
  "source_type" text,
  "source_id" uuid,
  "uploaded_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
-- Index for school lookup
CREATE INDEX "media_library_school_idx" ON "media_library"("school_id");
--> statement-breakpoint
-- GIN index for tag filtering
CREATE INDEX "media_library_tags_idx" ON "media_library" USING GIN("tags");
--> statement-breakpoint
-- Index for reusable media filtering
CREATE INDEX "media_library_reusable_idx" ON "media_library"("school_id", "reusable") WHERE "reusable" = true;
