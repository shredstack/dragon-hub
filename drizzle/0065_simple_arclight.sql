ALTER TABLE "scavenger_hunt_items" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "scavenger_hunt_items" ADD COLUMN "image_alt" text;--> statement-breakpoint
ALTER TABLE "scavenger_hunt_items" ADD COLUMN "image_fit" text DEFAULT 'contain' NOT NULL;