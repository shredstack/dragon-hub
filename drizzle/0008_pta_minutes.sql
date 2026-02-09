-- PTA Minutes Feature Migration
-- This migration adds PTA minutes, agendas, and redesigns the knowledge base

-- 1. Create new enums
CREATE TYPE "public"."minutes_status" AS ENUM('pending', 'approved');
CREATE TYPE "public"."article_status" AS ENUM('draft', 'published', 'archived');
CREATE TYPE "public"."drive_folder_type" AS ENUM('general', 'minutes');

-- 2. Add folder_type to school_drive_integrations
ALTER TABLE "school_drive_integrations" ADD COLUMN "folder_type" "drive_folder_type" DEFAULT 'general';

-- 3. Create pta_minutes table
CREATE TABLE "pta_minutes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "google_file_id" text NOT NULL,
  "google_drive_url" text NOT NULL,
  "file_name" text NOT NULL,
  "meeting_date" date,
  "school_year" text NOT NULL,
  "text_content" text,
  "ai_summary" text,
  "status" "minutes_status" DEFAULT 'pending' NOT NULL,
  "approved_by" uuid REFERENCES "users"("id"),
  "approved_at" timestamp with time zone,
  "last_synced_at" timestamp with time zone DEFAULT now(),
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX "pta_minutes_unique" ON "pta_minutes" USING btree ("school_id", "google_file_id");

-- 4. Create pta_agendas table
CREATE TABLE "pta_agendas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "target_month" integer NOT NULL,
  "target_year" integer NOT NULL,
  "content" text NOT NULL,
  "ai_generated_content" text,
  "source_minutes_ids" uuid[],
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

-- 5. Migrate knowledge_articles table
-- Step 5a: Add new columns (nullable initially)
ALTER TABLE "knowledge_articles" ADD COLUMN "slug" text;
ALTER TABLE "knowledge_articles" ADD COLUMN "summary" text;
ALTER TABLE "knowledge_articles" ADD COLUMN "body" text;
ALTER TABLE "knowledge_articles" ADD COLUMN "status" "article_status" DEFAULT 'draft';
ALTER TABLE "knowledge_articles" ADD COLUMN "source_minutes_id" uuid REFERENCES "pta_minutes"("id") ON DELETE SET NULL;
ALTER TABLE "knowledge_articles" ADD COLUMN "ai_generated" boolean DEFAULT false;
ALTER TABLE "knowledge_articles" ADD COLUMN "published_at" timestamp with time zone;
ALTER TABLE "knowledge_articles" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now();

-- Step 5b: Backfill data from existing rows
-- Generate slug from title (lowercase, replace spaces/special chars with hyphens)
UPDATE "knowledge_articles"
SET
  "slug" = LOWER(REGEXP_REPLACE(REGEXP_REPLACE("title", '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g')),
  "body" = COALESCE("description", ''),
  "status" = 'published',
  "published_at" = "created_at";

-- Handle duplicate slugs by appending row number
WITH duplicates AS (
  SELECT id, slug, ROW_NUMBER() OVER (PARTITION BY school_id, slug ORDER BY created_at) as rn
  FROM knowledge_articles
)
UPDATE knowledge_articles ka
SET slug = ka.slug || '-' || d.rn
FROM duplicates d
WHERE ka.id = d.id AND d.rn > 1;

-- Step 5c: Make school_id NOT NULL (if not already)
-- First ensure all rows have a school_id
-- ALTER TABLE "knowledge_articles" ALTER COLUMN "school_id" SET NOT NULL;

-- Step 5d: Make new required columns NOT NULL
ALTER TABLE "knowledge_articles" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "knowledge_articles" ALTER COLUMN "body" SET NOT NULL;
ALTER TABLE "knowledge_articles" ALTER COLUMN "status" SET NOT NULL;

-- Step 5e: Make google_drive_url nullable
ALTER TABLE "knowledge_articles" ALTER COLUMN "google_drive_url" DROP NOT NULL;

-- Step 5f: Create unique index on slug
CREATE UNIQUE INDEX "knowledge_articles_slug_unique" ON "knowledge_articles" USING btree ("school_id", "slug");

-- Step 5g: Drop old columns
ALTER TABLE "knowledge_articles" DROP COLUMN "description";
ALTER TABLE "knowledge_articles" DROP COLUMN "last_updated";

-- Step 5h: Add ON DELETE CASCADE to school_id if not present
ALTER TABLE "knowledge_articles" DROP CONSTRAINT IF EXISTS "knowledge_articles_school_id_schools_id_fk";
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_school_id_schools_id_fk"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE;
