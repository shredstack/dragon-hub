-- Room parent waitlist.
--
-- A full classroom used to turn a parent away ("Room parent spots are full
-- (2/2)"), which is the one thing a signup form should never do to someone who
-- just volunteered. Room parents now behave like committees: overflow joins a
-- line, and a removal promotes whoever is at the front of it.
--
-- Hand-written rather than generated: swapping a column's enum type needs a
-- USING cast, and the unique index is partial. drizzle-kit emits neither.

-- Deliberately a NEW type rather than a value added to `volunteer_signup_status`.
-- That enum is shared with `volunteer_interests`, where 'waitlisted' would be a
-- legal value meaning nothing — interest is non-binding, there is no seat to run
-- out of. Same reasoning as `committee_signup_status`.
CREATE TYPE "classroom_signup_status" AS ENUM('active', 'waitlisted', 'removed');
--> statement-breakpoint

-- Dropped BEFORE the type swap: its predicate (`WHERE status = 'active'`) is
-- bound to the old type, and it is being replaced anyway.
DROP INDEX IF EXISTS "volunteer_signups_unique_active";
--> statement-breakpoint

-- The default is `'active'::volunteer_signup_status`, which would block the
-- type change, so it comes off first and goes back on after.
ALTER TABLE "volunteer_signups" ALTER COLUMN "status" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "volunteer_signups" ALTER COLUMN "status" TYPE "classroom_signup_status"
  USING "status"::text::"classroom_signup_status";
--> statement-breakpoint
ALTER TABLE "volunteer_signups" ALTER COLUMN "status" SET DEFAULT 'active';
--> statement-breakpoint

ALTER TABLE "volunteer_signups" ADD COLUMN "waitlisted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "volunteer_signups" ADD COLUMN "promoted_at" timestamp with time zone;
--> statement-breakpoint

-- Serves "who's next for this room" on every removal.
CREATE INDEX "volunteer_signups_waitlist_idx" ON "volunteer_signups" ("classroom_id", "waitlisted_at");
--> statement-breakpoint

-- Covers `waitlisted` as well as `active`, so nobody holds a room parent seat
-- and a place in that room's line at the same time. `removed` rows stay
-- unconstrained so re-signup history accumulates, exactly as before.
CREATE UNIQUE INDEX "volunteer_signups_unique_open" ON "volunteer_signups" ("classroom_id", "email", "role")
  WHERE status IN ('active', 'waitlisted');
