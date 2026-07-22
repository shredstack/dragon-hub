-- Give the records that carry history somewhere to go besides deletion.
--
-- Almost every foreign key in this schema cascades, which is right for cleanup
-- and wrong for the record. Deleting a volunteer campaign took every parent who
-- had signed up down with it; deleting a recurring event took the interest that
-- told next year's board who ran it last time. The rule the classroom tables
-- already follow — hard delete only when nothing is attached, otherwise archive
-- — needs an archive column on each table before it can be applied elsewhere.
--
-- archived_at  when it was retired; NULL means live. Every list query filters
--              on IS NULL, so archiving hides a row everywhere at once.
-- archived_by  who did it, for the "why is this gone?" conversation.
--
-- Nothing is backfilled: existing rows are all live, which is already what
-- NULL means.
--
-- Written by hand because drizzle-kit generate can't run non-interactively on
-- this branch's pending diffs (snapshots stopped at 0007) — same as 0038.

ALTER TABLE "volunteer_campaigns" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "volunteer_campaigns" ADD COLUMN IF NOT EXISTS "archived_by" uuid;
--> statement-breakpoint
ALTER TABLE "volunteer_campaign_events" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "volunteer_campaign_events" ADD COLUMN IF NOT EXISTS "archived_by" uuid;
--> statement-breakpoint
ALTER TABLE "event_plan_meetings" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "event_plan_meetings" ADD COLUMN IF NOT EXISTS "archived_by" uuid;
--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN IF NOT EXISTS "archived_by" uuid;
--> statement-breakpoint
ALTER TABLE "pta_minutes" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "pta_minutes" ADD COLUMN IF NOT EXISTS "archived_by" uuid;
--> statement-breakpoint
ALTER TABLE "pta_agendas" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "pta_agendas" ADD COLUMN IF NOT EXISTS "archived_by" uuid;
--> statement-breakpoint
ALTER TABLE "board_handoff_notes" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "board_handoff_notes" ADD COLUMN IF NOT EXISTS "archived_by" uuid;
--> statement-breakpoint

-- ON DELETE SET NULL throughout: losing the account of whoever archived a row
-- must never take the archived row with it.
DO $$ BEGIN
  ALTER TABLE "volunteer_campaigns" ADD CONSTRAINT "volunteer_campaigns_archived_by_fk"
    FOREIGN KEY ("archived_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "volunteer_campaign_events" ADD CONSTRAINT "volunteer_campaign_events_archived_by_fk"
    FOREIGN KEY ("archived_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_plan_meetings" ADD CONSTRAINT "event_plan_meetings_archived_by_fk"
    FOREIGN KEY ("archived_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_archived_by_fk"
    FOREIGN KEY ("archived_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pta_minutes" ADD CONSTRAINT "pta_minutes_archived_by_fk"
    FOREIGN KEY ("archived_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pta_agendas" ADD CONSTRAINT "pta_agendas_archived_by_fk"
    FOREIGN KEY ("archived_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "board_handoff_notes" ADD CONSTRAINT "board_handoff_notes_archived_by_fk"
    FOREIGN KEY ("archived_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- Every list query for these tables now carries "archived_at IS NULL", so the
-- partial indexes keep those reads on the same plan they had before.
CREATE INDEX IF NOT EXISTS "volunteer_campaigns_live_idx"
  ON "volunteer_campaigns" ("school_id", "school_year") WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "volunteer_campaign_events_live_idx"
  ON "volunteer_campaign_events" ("campaign_id") WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_plan_meetings_live_idx"
  ON "event_plan_meetings" ("event_plan_id") WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pta_minutes_live_idx"
  ON "pta_minutes" ("school_id") WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_handoff_notes_live_idx"
  ON "board_handoff_notes" ("school_id", "position") WHERE "archived_at" IS NULL;
