CREATE TABLE "scavenger_hunt_item_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scavenger_hunt_items" ADD COLUMN "questions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "scavenger_hunt_items" ADD COLUMN "save_responses" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scavenger_hunt_item_responses" ADD CONSTRAINT "scavenger_hunt_item_responses_participant_id_scavenger_hunt_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."scavenger_hunt_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scavenger_hunt_item_responses" ADD CONSTRAINT "scavenger_hunt_item_responses_item_id_scavenger_hunt_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."scavenger_hunt_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scavenger_hunt_item_responses_unique" ON "scavenger_hunt_item_responses" USING btree ("participant_id","item_id");--> statement-breakpoint
CREATE INDEX "scavenger_hunt_item_responses_item_idx" ON "scavenger_hunt_item_responses" USING btree ("item_id");