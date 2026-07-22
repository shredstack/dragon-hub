-- Hide internal "classrooms" from the public volunteer sign-up page.
--
-- The PTA Board is modeled as a classroom so it can reuse the message board and
-- roster plumbing. That's fine internally, but the Back to School Night QR code
-- lists every active classroom, so parents scanning it were offered "PTA Board"
-- alongside their child's real classroom.
--
-- Written by hand because drizzle-kit generate can't run non-interactively on
-- this branch's pending diffs (snapshots stopped at 0007).

ALTER TABLE "classrooms" ADD COLUMN IF NOT EXISTS "exclude_from_signup" boolean DEFAULT false;
--> statement-breakpoint
UPDATE "classrooms"
SET "exclude_from_signup" = true
WHERE "exclude_from_signup" IS NOT TRUE
  AND ("name" ILIKE '%pta board%' OR "name" ILIKE '%pta_board%');
