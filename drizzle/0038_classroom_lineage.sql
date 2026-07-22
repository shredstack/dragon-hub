-- Give classrooms a cross-year identity.
--
-- Each school year gets its own classroom row so that year's roster, room
-- parents, messages and tasks stay attached to the year they happened in. What
-- was missing was any way to say "these five rows are all Mrs. Glover's 1st
-- grade room across five years" — so:
--
--   lineage_id     shared by every yearly instance of the same room; a room's
--                  first row points at itself.
--   rolled_from_id the immediate predecessor, so you can walk the chain in
--                  order (mirrors school_memberships.renewed_from).
--
-- Backfill sets every existing classroom as the head of its own lineage.
--
-- Written by hand because drizzle-kit generate can't run non-interactively on
-- this branch's pending diffs (snapshots stopped at 0007).

ALTER TABLE "classrooms" ADD COLUMN IF NOT EXISTS "lineage_id" uuid;
--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN IF NOT EXISTS "rolled_from_id" uuid;
--> statement-breakpoint
UPDATE "classrooms" SET "lineage_id" = "id" WHERE "lineage_id" IS NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_rolled_from_id_fk"
    FOREIGN KEY ("rolled_from_id") REFERENCES "classrooms"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "classrooms_lineage_idx" ON "classrooms" ("lineage_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "classrooms_school_year_idx" ON "classrooms" ("school_id", "school_year");
