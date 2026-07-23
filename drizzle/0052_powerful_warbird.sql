-- Adds the 'all_classrooms' committee kind: a committee that needs a set number
-- of volunteers in EVERY active classroom (Meet the Masters), as opposed to
-- 'classroom', which pins a committee to one specific room. No classroom is
-- chosen — `per_classroom_limit` is the whole configuration, and each signup
-- carries the room that volunteer covers.
--
-- The kind is REPLACED rather than extended with `ALTER TYPE ... ADD VALUE`.
-- Postgres refuses to use a newly added enum value inside the transaction that
-- added it, and drizzle applies every pending migration in ONE transaction — so
-- an ADD VALUE here would make the backfill below (which has to write
-- 'all_classrooms') fail on any database where this migration is still pending.
-- A type CREATED in the same transaction carries no such restriction, so the
-- rename/create/swap dance is what lets the new value and the data that needs it
-- ship together. Value order matches what ADD VALUE would have produced, so
-- databases migrated either way sort identically.
ALTER TABLE "committees" DROP CONSTRAINT "committees_scope_target_check";--> statement-breakpoint
ALTER TYPE "public"."committee_scope" RENAME TO "committee_scope_old";--> statement-breakpoint
CREATE TYPE "public"."committee_scope" AS ENUM('school', 'classroom', 'event_plan', 'all_classrooms');--> statement-breakpoint
ALTER TABLE "committees" ALTER COLUMN "scope" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "committees" ALTER COLUMN "scope" TYPE "public"."committee_scope" USING "scope"::text::"public"."committee_scope";--> statement-breakpoint
ALTER TABLE "committees" ALTER COLUMN "scope" SET DEFAULT 'school';--> statement-breakpoint
DROP TYPE "public"."committee_scope_old";--> statement-breakpoint
-- Per-classroom staffing now belongs to the 'all_classrooms' kind rather than to
-- a signup-page placement flag. Before this migration the ONLY way to express
-- "N volunteers in every room" was a school-scoped committee carrying
-- `show_per_classroom_on_signup`, so those rows ARE the new kind and are moved to
-- it. Clearing them instead would silently drop a school's Meet the Masters
-- committee off the room parent signup page with nothing to tell the board.
UPDATE "committees"
   SET "scope" = 'all_classrooms'
 WHERE "scope" = 'school'
   AND "show_per_classroom_on_signup" = true
   AND "per_classroom_limit" IS NOT NULL
   AND "per_classroom_limit" > 0;--> statement-breakpoint
-- What's left carrying the settings can't become an 'all_classrooms' committee:
-- it has no staffing number, or it's pinned to one classroom or event plan
-- (which the scope CHECK below forbids for this kind). Clear them rather than
-- leave a committee configured for a kind it isn't.
UPDATE "committees"
   SET "show_per_classroom_on_signup" = false,
       "per_classroom_limit" = NULL
 WHERE "scope" <> 'all_classrooms'
   AND ("show_per_classroom_on_signup" = true OR "per_classroom_limit" IS NOT NULL);--> statement-breakpoint
-- The scope CHECK compares `scope::text` rather than enum literals, mirroring the
-- `check()` declared on the table in `schema.ts`.
ALTER TABLE "committees" ADD CONSTRAINT "committees_scope_target_check" CHECK (("committees"."scope"::text = 'school'         AND "committees"."classroom_id" IS NULL     AND "committees"."event_plan_id" IS NULL)
       OR ("committees"."scope"::text = 'all_classrooms' AND "committees"."classroom_id" IS NULL     AND "committees"."event_plan_id" IS NULL)
       OR ("committees"."scope"::text = 'classroom'      AND "committees"."classroom_id" IS NOT NULL AND "committees"."event_plan_id" IS NULL)
       OR ("committees"."scope"::text = 'event_plan'     AND "committees"."event_plan_id" IS NOT NULL AND "committees"."classroom_id" IS NULL));
