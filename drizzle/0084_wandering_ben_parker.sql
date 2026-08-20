ALTER TABLE "email_campaigns" ADD COLUMN "header_html" text;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "header_image_url" text;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "header_image_alt" text;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "cloned_from_campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "email_content_items" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "email_content_items" ADD COLUMN "end_date" date;--> statement-breakpoint
--> Backfill before the NOT NULL: `target_date` meant "the day this is about",
--> so an existing item starts being relevant when it was submitted and stops
--> on its target date (or a month after submission when it had none).
UPDATE "email_content_items" SET
  "start_date" = LEAST(
    COALESCE("created_at"::date, CURRENT_DATE),
    COALESCE("target_date", COALESCE("created_at"::date, CURRENT_DATE))
  ),
  "end_date" = GREATEST(
    COALESCE("target_date", COALESCE("created_at"::date, CURRENT_DATE) + 30),
    COALESCE("created_at"::date, CURRENT_DATE)
  )
WHERE "start_date" IS NULL OR "end_date" IS NULL;--> statement-breakpoint
ALTER TABLE "email_content_items" ALTER COLUMN "start_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "email_content_items" ALTER COLUMN "end_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "email_recurring_sections" ADD COLUMN "image_position" text DEFAULT 'below' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_sections" ADD COLUMN "image_position" text DEFAULT 'below' NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "email_settings" jsonb;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_cloned_from_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("cloned_from_campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE set null ON UPDATE no action;