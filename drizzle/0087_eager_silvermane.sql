-- email_content_items.included_in_campaign_id is a record of where a submission
-- last went, not a lock on the campaign it names — but its foreign key was
-- NO ACTION, so any draft that had ever pulled in a submission could not be
-- deleted. Now the pointer forgets, which is the right answer once the email
-- it points at no longer exists.
--
-- Dropped by both names it can be carrying: drizzle-kit emits a DROP for its
-- own naming scheme, and misses the `_fkey` name that `push` gave the
-- constraint when this table was first created in 0015 — which is the name
-- production actually has. Without the IF EXISTS pair this migration either
-- errors out or silently leaves NO ACTION in force.
ALTER TABLE "email_content_items" DROP CONSTRAINT IF EXISTS "email_content_items_included_in_campaign_id_fkey";
--> statement-breakpoint
ALTER TABLE "email_content_items" DROP CONSTRAINT IF EXISTS "email_content_items_included_in_campaign_id_email_campaigns_id_fk";
--> statement-breakpoint
ALTER TABLE "email_content_items" ADD CONSTRAINT "email_content_items_included_in_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("included_in_campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE set null ON UPDATE no action;
