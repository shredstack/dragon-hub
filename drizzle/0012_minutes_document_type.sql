-- Create the minutes document type enum
CREATE TYPE "public"."minutes_document_type" AS ENUM('minutes', 'agenda');

-- Add new columns to pta_minutes table
ALTER TABLE "pta_minutes" ADD COLUMN "document_type" "minutes_document_type" DEFAULT 'minutes' NOT NULL;
ALTER TABLE "pta_minutes" ADD COLUMN "meeting_month" integer;
ALTER TABLE "pta_minutes" ADD COLUMN "meeting_year" integer;

-- Backfill meeting_month and meeting_year from existing meeting_date values
UPDATE "pta_minutes"
SET
  meeting_month = EXTRACT(MONTH FROM meeting_date::date),
  meeting_year = EXTRACT(YEAR FROM meeting_date::date)
WHERE meeting_date IS NOT NULL;

-- Backfill document_type based on filename containing 'agenda'
UPDATE "pta_minutes"
SET document_type = 'agenda'
WHERE LOWER(file_name) LIKE '%agenda%';

-- Add index for efficient filtering by document type and month
CREATE INDEX "pta_minutes_document_type_idx" ON "pta_minutes" ("document_type");
CREATE INDEX "pta_minutes_meeting_month_year_idx" ON "pta_minutes" ("meeting_month", "meeting_year");
