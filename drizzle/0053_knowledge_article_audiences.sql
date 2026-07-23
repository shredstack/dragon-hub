CREATE TYPE "public"."knowledge_audience_type" AS ENUM('everyone', 'volunteer_role', 'committee');--> statement-breakpoint
CREATE TABLE "knowledge_article_audiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"audience_type" "knowledge_audience_type" NOT NULL,
	"volunteer_role" "volunteer_role",
	"committee_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "committees" DROP CONSTRAINT "committees_scope_target_check";--> statement-breakpoint
ALTER TABLE "knowledge_article_audiences" ADD CONSTRAINT "knowledge_article_audiences_article_id_knowledge_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_article_audiences" ADD CONSTRAINT "knowledge_article_audiences_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_article_audiences" ADD CONSTRAINT "knowledge_article_audiences_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_article_audiences_article_idx" ON "knowledge_article_audiences" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "knowledge_article_audiences_committee_idx" ON "knowledge_article_audiences" USING btree ("committee_id");--> statement-breakpoint
ALTER TABLE "committees" ADD CONSTRAINT "committees_scope_target_check" CHECK (("committees"."scope"::text = 'school'         AND "committees"."classroom_id" IS NULL     AND "committees"."event_plan_id" IS NULL)
       OR ("committees"."scope"::text = 'all_classrooms' AND "committees"."classroom_id" IS NULL     AND "committees"."event_plan_id" IS NULL)
       OR ("committees"."scope"::text = 'classroom'      AND "committees"."classroom_id" IS NOT NULL AND "committees"."event_plan_id" IS NULL)
       OR ("committees"."scope"::text = 'event_plan'     AND "committees"."event_plan_id" IS NOT NULL AND "committees"."classroom_id" IS NULL));--> statement-breakpoint
-- Exactly one target column is populated, and only the one the type calls for.
-- Without this a row could claim audience_type 'committee' with a null
-- committee_id, which the EXISTS predicate would read as "matches nothing" —
-- an audience the board thinks they granted and nobody ever gets.
ALTER TABLE "knowledge_article_audiences" ADD CONSTRAINT "knowledge_article_audiences_target_check" CHECK (
  ("audience_type" = 'everyone'       AND "volunteer_role" IS NULL     AND "committee_id" IS NULL) OR
  ("audience_type" = 'volunteer_role' AND "volunteer_role" IS NOT NULL AND "committee_id" IS NULL) OR
  ("audience_type" = 'committee'      AND "committee_id"   IS NOT NULL AND "volunteer_role" IS NULL)
);--> statement-breakpoint
-- One grant per (article, audience). Three partial indexes rather than one
-- expression index: the target lives in whichever nullable column the type
-- selects, and the obvious COALESCE(committee_id::text, ...) form is rejected
-- outright — casting an enum to text is STABLE, not IMMUTABLE, so Postgres
-- won't index it. Partial indexes need no cast, and each one reads as the rule
-- it enforces.
CREATE UNIQUE INDEX "knowledge_article_audiences_everyone_unique"
  ON "knowledge_article_audiences" ("article_id")
  WHERE "audience_type" = 'everyone';--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_article_audiences_role_unique"
  ON "knowledge_article_audiences" ("article_id", "volunteer_role")
  WHERE "audience_type" = 'volunteer_role';--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_article_audiences_committee_unique"
  ON "knowledge_article_audiences" ("article_id", "committee_id")
  WHERE "audience_type" = 'committee';