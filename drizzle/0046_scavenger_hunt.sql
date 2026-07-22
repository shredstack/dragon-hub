CREATE TYPE "public"."scavenger_hunt_status" AS ENUM('draft', 'active', 'closed');--> statement-breakpoint
CREATE TABLE "scavenger_hunt_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scavenger_hunt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hunt_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"emoji" text DEFAULT '⭐' NOT NULL,
	"link_url" text,
	"link_label" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scavenger_hunt_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hunt_id" uuid NOT NULL,
	"handle" text NOT NULL,
	"handle_emoji" text NOT NULL,
	"token_hash" text NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_name" text,
	"claimed_email" text
);
--> statement-breakpoint
CREATE TABLE "scavenger_hunts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"qr_code" text NOT NULL,
	"title" text NOT NULL,
	"intro" text,
	"completion_message" text,
	"school_year" text NOT NULL,
	"status" "scavenger_hunt_status" DEFAULT 'draft' NOT NULL,
	"show_on_signup_success" boolean DEFAULT false NOT NULL,
	"collect_finisher_contact" boolean DEFAULT true NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "scavenger_hunts_qr_code_unique" UNIQUE("qr_code")
);
--> statement-breakpoint
ALTER TABLE "scavenger_hunt_completions" ADD CONSTRAINT "scavenger_hunt_completions_participant_id_scavenger_hunt_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."scavenger_hunt_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scavenger_hunt_completions" ADD CONSTRAINT "scavenger_hunt_completions_item_id_scavenger_hunt_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."scavenger_hunt_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scavenger_hunt_items" ADD CONSTRAINT "scavenger_hunt_items_hunt_id_scavenger_hunts_id_fk" FOREIGN KEY ("hunt_id") REFERENCES "public"."scavenger_hunts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scavenger_hunt_participants" ADD CONSTRAINT "scavenger_hunt_participants_hunt_id_scavenger_hunts_id_fk" FOREIGN KEY ("hunt_id") REFERENCES "public"."scavenger_hunts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scavenger_hunts" ADD CONSTRAINT "scavenger_hunts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scavenger_hunts" ADD CONSTRAINT "scavenger_hunts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scavenger_hunts" ADD CONSTRAINT "scavenger_hunts_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scavenger_hunt_completions_unique" ON "scavenger_hunt_completions" USING btree ("participant_id","item_id");--> statement-breakpoint
CREATE INDEX "scavenger_hunt_completions_item_idx" ON "scavenger_hunt_completions" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "scavenger_hunt_items_hunt_idx" ON "scavenger_hunt_items" USING btree ("hunt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scavenger_hunt_participants_handle_unique" ON "scavenger_hunt_participants" USING btree ("hunt_id","handle");--> statement-breakpoint
CREATE UNIQUE INDEX "scavenger_hunt_participants_token_unique" ON "scavenger_hunt_participants" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "scavenger_hunt_participants_board_idx" ON "scavenger_hunt_participants" USING btree ("hunt_id","completed_count","finished_at");--> statement-breakpoint
CREATE INDEX "scavenger_hunts_school_year_idx" ON "scavenger_hunts" USING btree ("school_id","school_year");