-- Adds the 'all_classrooms' committee kind: a committee that needs a set number
-- of volunteers in EVERY active classroom (Meet the Masters), as opposed to
-- 'classroom', which pins a committee to one specific room. No classroom is
-- chosen — `per_classroom_limit` is the whole configuration, and each signup
-- carries the room that volunteer covers.
--
-- The scope CHECK compares `scope::text` rather than enum literals. Postgres
-- refuses to use a newly added enum value inside the transaction that added it,
-- and drizzle applies every pending migration in ONE transaction — the cast is
-- what lets the ADD VALUE and the constraint that depends on it ship together.
ALTER TYPE "public"."committee_scope" ADD VALUE IF NOT EXISTS 'all_classrooms';--> statement-breakpoint
ALTER TABLE "committees" DROP CONSTRAINT "committees_scope_target_check";--> statement-breakpoint
ALTER TABLE "committees" ADD CONSTRAINT "committees_scope_target_check" CHECK (("committees"."scope"::text = 'school'         AND "committees"."classroom_id" IS NULL     AND "committees"."event_plan_id" IS NULL)
       OR ("committees"."scope"::text = 'all_classrooms' AND "committees"."classroom_id" IS NULL     AND "committees"."event_plan_id" IS NULL)
       OR ("committees"."scope"::text = 'classroom'      AND "committees"."classroom_id" IS NOT NULL AND "committees"."event_plan_id" IS NULL)
       OR ("committees"."scope"::text = 'event_plan'     AND "committees"."event_plan_id" IS NOT NULL AND "committees"."classroom_id" IS NULL));--> statement-breakpoint
-- Per-classroom staffing now belongs to the 'all_classrooms' kind rather than to
-- a signup-page placement flag. Any row carrying those settings predates the new
-- kind, so clear them rather than leave a committee configured for a kind it
-- isn't.
UPDATE "committees"
   SET "show_per_classroom_on_signup" = false,
       "per_classroom_limit" = NULL
 WHERE "scope"::text <> 'all_classrooms';
