-- DLI (Dual Language Immersion) Groups Migration
-- Adds support for DLI classroom groupings at the school level

-- 1. Create dli_groups table
CREATE TABLE "dli_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "language" text,
  "color" text,
  "sort_order" integer DEFAULT 0,
  "active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now()
);

-- Index for common queries
CREATE INDEX "dli_groups_school_idx" ON "dli_groups" ("school_id");

-- Unique constraint: one group name per school
CREATE UNIQUE INDEX "dli_groups_school_name_unique" ON "dli_groups" ("school_id", "name");

-- 2. Add DLI fields to classrooms table
ALTER TABLE "classrooms" ADD COLUMN "is_dli" boolean DEFAULT false;
ALTER TABLE "classrooms" ADD COLUMN "dli_group_id" uuid REFERENCES "dli_groups"("id") ON DELETE SET NULL;
