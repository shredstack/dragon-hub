-- Year planning: generate every recurring event's plan at once, and record who
-- is running each one.
--
-- Two things the board does before a school year starts, neither of which the
-- app could express:
--
--   1. Open the year's slate in one pass. Cloning last year's plan one event at
--      a time works, but a school with two dozen recurring events won't do it
--      twenty-four times. The catalog entry already knows the event's category,
--      budget and tags; it now also carries the plan-level defaults (event type
--      and location) so a generated plan arrives filled in rather than empty.
--
--   2. Assign leads. A PTA has two kinds, and they are not interchangeable: the
--      board member who owns the event on the board's behalf (each carries three
--      or four a year), and the committee chair, a parent who runs it and is
--      deliberately not on the board. Both hold full lead permissions, so this
--      is modelled as a `lead_type` alongside the existing `role` rather than as
--      new roles — every existing `role = 'lead'` authorization check keeps
--      covering both without knowing the column exists.
--
-- Committee chairs frequently have no account when they're assigned in August,
-- so event_plan_members.user_id becomes nullable and gains placeholder name and
-- email. A placeholder is a roster fact and nothing more: every access check
-- matches on user_id, and NULL never equals a user id, so it grants no access
-- until the person actually joins. The CHECK keeps rows from being neither.
--
-- Written by hand because drizzle-kit generate can't run non-interactively on
-- this repo's pending diffs (snapshots stopped at 0007) — same as 0040 and 0043.

DO $$ BEGIN
  CREATE TYPE "event_plan_lead_type" AS ENUM ('board', 'committee_chair');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "event_catalog" ADD COLUMN IF NOT EXISTS "default_event_type" text;
--> statement-breakpoint
ALTER TABLE "event_catalog" ADD COLUMN IF NOT EXISTS "default_location" text;
--> statement-breakpoint
ALTER TABLE "event_plan_members" ADD COLUMN IF NOT EXISTS "lead_type" "event_plan_lead_type";
--> statement-breakpoint
ALTER TABLE "event_plan_members" ADD COLUMN IF NOT EXISTS "placeholder_name" text;
--> statement-breakpoint
ALTER TABLE "event_plan_members" ADD COLUMN IF NOT EXISTS "placeholder_email" text;
--> statement-breakpoint
ALTER TABLE "event_plan_members" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_plan_members" ADD CONSTRAINT "event_plan_members_identity"
    CHECK ("user_id" IS NOT NULL OR "placeholder_name" IS NOT NULL);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
-- An invited chair should still be a chair once they accept, so the type rides
-- along on the invite and is copied onto the member row it creates.
ALTER TABLE "event_plan_invites" ADD COLUMN IF NOT EXISTS "lead_type" "event_plan_lead_type";
--> statement-breakpoint
-- Deliberately no backfill. Existing leads predate the distinction, and
-- guessing "board" for all of them would put committee chairs on the board's
-- workload report. NULL reads as an unclassified lead, which is the truth.
--
-- The assignment page filters by lead_type, so it needs to find a plan's leads
-- without scanning every membership row in the school.
CREATE INDEX IF NOT EXISTS "event_plan_members_lead_type_idx"
  ON "event_plan_members" ("event_plan_id", "lead_type");
