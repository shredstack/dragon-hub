-- The board-curated link list that leads the dashboard.
--
-- Trimmed from the generated diff: drizzle's snapshots hadn't caught up with
-- the hand-written 0054, so `generate` re-emitted board_positions and the enum
-- widening alongside this table. Those statements are already applied; only
-- the important_links ones belong here.

CREATE TABLE IF NOT EXISTS "important_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"url" text NOT NULL,
	"icon_emoji" text,
	"open_mode" text DEFAULT 'new_tab' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "important_links" ADD CONSTRAINT "important_links_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "important_links" ADD CONSTRAINT "important_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "important_links_school_idx" ON "important_links" USING btree ("school_id","active","sort_order");
