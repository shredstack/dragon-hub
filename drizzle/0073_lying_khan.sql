ALTER TABLE "scavenger_hunts" ADD COLUMN "reset_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scavenger_hunts" ADD COLUMN "reset_by" uuid;--> statement-breakpoint
ALTER TABLE "scavenger_hunts" ADD COLUMN "reset_player_count" integer;--> statement-breakpoint
ALTER TABLE "scavenger_hunts" ADD CONSTRAINT "scavenger_hunts_reset_by_users_id_fk" FOREIGN KEY ("reset_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;