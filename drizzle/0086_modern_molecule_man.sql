ALTER TABLE "email_campaigns" ADD COLUMN "header_image_width" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_recurring_sections" ADD COLUMN "image_width" text DEFAULT 'large' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_sections" ADD COLUMN "image_width" text DEFAULT 'large' NOT NULL;