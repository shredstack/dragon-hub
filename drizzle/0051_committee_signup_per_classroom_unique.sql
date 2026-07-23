-- Per-classroom (MTM) committees let a parent volunteer in more than one room,
-- so an open signup is now unique per (committee, classroom, email) rather than
-- per (committee, email). COALESCE folds the school-wide NULL classroom to a
-- fixed sentinel, since Postgres treats NULLs as distinct in a plain unique
-- index — without it two school-wide signups for the same email would no longer
-- collide. The sentinel is the all-zero UUID, which gen_random_uuid() never
-- produces, so it can't clash with a real classroom id.
--
-- This is strictly looser than the old index for per-classroom rows and
-- identical for school-wide rows, so no existing row can violate it.
DROP INDEX IF EXISTS "committee_signups_unique_open";--> statement-breakpoint
CREATE UNIQUE INDEX "committee_signups_unique_open"
  ON "committee_signups" ("committee_id", COALESCE("classroom_id", '00000000-0000-0000-0000-000000000000'::uuid), "email")
  WHERE status IN ('active', 'waitlisted');
