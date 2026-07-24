-- Board positions become school-managed data instead of a hardcoded pg enum.
--
-- Every table that names a position keeps storing the same *slug* it always
-- has, so no data moves; the column type just widens from the enum to text.
-- The new board_positions table owns the label, description, ordering and
-- active flag for each slug, per school.

CREATE TABLE IF NOT EXISTS "board_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_standard" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board_positions" ADD CONSTRAINT "board_positions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "board_positions_school_slug_unique" ON "board_positions" USING btree ("school_id","slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_positions_school_idx" ON "board_positions" USING btree ("school_id","active");
--> statement-breakpoint

-- Widen every position column from the enum to text. Values are unchanged.
ALTER TABLE "school_memberships" ALTER COLUMN "board_position" SET DATA TYPE text USING "board_position"::text;
--> statement-breakpoint
ALTER TABLE "onboarding_resources" ALTER COLUMN "position" SET DATA TYPE text USING "position"::text;
--> statement-breakpoint
ALTER TABLE "onboarding_checklist_items" ALTER COLUMN "position" SET DATA TYPE text USING "position"::text;
--> statement-breakpoint
ALTER TABLE "state_onboarding_resources" ALTER COLUMN "position" SET DATA TYPE text USING "position"::text;
--> statement-breakpoint
ALTER TABLE "district_onboarding_resources" ALTER COLUMN "position" SET DATA TYPE text USING "position"::text;
--> statement-breakpoint
ALTER TABLE "board_handoff_notes" ALTER COLUMN "position" SET DATA TYPE text USING "position"::text;
--> statement-breakpoint
ALTER TABLE "board_handoff_summaries" ALTER COLUMN "position" SET DATA TYPE text USING "position"::text;
--> statement-breakpoint
ALTER TABLE "onboarding_guides" ALTER COLUMN "position" SET DATA TYPE text USING "position"::text;
--> statement-breakpoint
ALTER TABLE "event_catalog" ALTER COLUMN "related_positions" SET DATA TYPE text[] USING "related_positions"::text[];
--> statement-breakpoint
ALTER TABLE "volunteer_campaigns" ALTER COLUMN "owner_position" SET DATA TYPE text USING "owner_position"::text;
--> statement-breakpoint
ALTER TABLE "committees" ALTER COLUMN "owner_position" SET DATA TYPE text USING "owner_position"::text;
--> statement-breakpoint

-- Seed the standard slate for every existing school. Keep in sync with
-- STANDARD_BOARD_POSITIONS in src/lib/board-positions-shared.ts.
INSERT INTO "board_positions" ("school_id", "slug", "label", "description", "sort_order", "is_standard")
SELECT s."id", v."slug", v."label", v."description", v."sort_order", true
FROM "schools" s
CROSS JOIN (VALUES
	('president', 'President', 'Leads the PTA, runs board and general meetings, and is the main point of contact with school administration.', 0),
	('vice_president', 'Vice President', 'Supports the President, steps in when they are unavailable, and often oversees committees and events.', 1),
	('president_elect', 'President Elect', 'Shadows the President in preparation for taking over the role next year.', 2),
	('vp_elect', 'VP Elect', 'Shadows the Vice President in preparation for taking over the role next year.', 3),
	('treasurer', 'Treasurer', 'Owns the budget, records income and expenses, handles reimbursements, and reports finances to the board.', 4),
	('secretary', 'Secretary', 'Takes minutes at meetings, maintains records and the document archive, and handles official correspondence.', 5),
	('legislative_vp', 'Legislative VP', 'Tracks education legislation and advocacy efforts, and keeps the board informed on policy that affects the school.', 6),
	('public_relations_vp', 'Public Relations VP', 'Handles communications: newsletters, social media, flyers, and publicity for PTA events.', 7),
	('membership_vp', 'Membership VP', 'Runs the membership drive, tracks enrollment, and welcomes new PTA members.', 8),
	('room_parent_vp', 'Room Parent VP', 'Recruits and assigns a room parent for every classroom, and supports them through the year.', 9)
) AS v("slug", "label", "description", "sort_order")
ON CONFLICT ("school_id", "slug") DO NOTHING;
--> statement-breakpoint

DROP TYPE IF EXISTS "public"."pta_board_position";
