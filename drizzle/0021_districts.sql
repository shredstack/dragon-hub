-- Districts reference table for school district lookups
-- Data sourced from NCES (National Center for Education Statistics)
-- See docs/updating-district-data.md for update instructions

CREATE TABLE IF NOT EXISTS "districts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "state_code" text NOT NULL,
  "state_name" text NOT NULL,
  "name" text NOT NULL,
  "nces_id" text,
  "created_at" timestamp with time zone DEFAULT now()
);

-- Unique constraint on state + district name to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS "districts_state_name_unique" ON "districts" USING btree ("state_code", "name");

-- Index for fast lookups by state
CREATE INDEX IF NOT EXISTS "districts_state_code_idx" ON "districts" USING btree ("state_code");

-- Index for searching district names
CREATE INDEX IF NOT EXISTS "districts_name_idx" ON "districts" USING btree ("name");
