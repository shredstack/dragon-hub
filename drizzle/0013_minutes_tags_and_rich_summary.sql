-- Tags and Rich Minutes Summary Migration

-- 1. Create shared tags table (used for minutes, knowledge articles, events, etc.)
CREATE TABLE "tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "display_name" text NOT NULL,
  "usage_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX "tags_unique" ON "tags" USING btree ("school_id", "name");

-- 2. Add new columns to pta_minutes for rich AI analysis
ALTER TABLE "pta_minutes" ADD COLUMN "ai_key_items" text[];
ALTER TABLE "pta_minutes" ADD COLUMN "ai_action_items" text[];
ALTER TABLE "pta_minutes" ADD COLUMN "ai_improvements" text[];
ALTER TABLE "pta_minutes" ADD COLUMN "tags" text[];
ALTER TABLE "pta_minutes" ADD COLUMN "ai_extracted_date" date;
ALTER TABLE "pta_minutes" ADD COLUMN "date_confidence" text;

-- 3. Create GIN index for efficient tag filtering on minutes
CREATE INDEX "pta_minutes_tags_idx" ON "pta_minutes" USING gin ("tags");

-- 4. Create GIN index for efficient tag filtering on knowledge articles (already has tags column)
CREATE INDEX IF NOT EXISTS "knowledge_articles_tags_idx" ON "knowledge_articles" USING gin ("tags");
