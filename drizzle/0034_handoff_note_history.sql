-- Handoff notes become append-only history.
--
-- board_handoff_notes was unique on (school_id, position, school_year), so a
-- position had exactly ONE note per year and every save overwrote it. Two
-- people sharing a role, or a mid-year handoff, silently clobbered each other,
-- and the AI "generate from raw notes" flow wrote straight over whatever the
-- author had already typed. Board members put hours into these notes; losing
-- them to an UPDATE is the worst possible failure mode for this feature.
--
-- After this migration a position simply accumulates notes. The newest is the
-- default shown; the rest stay readable forever. A new summaries table caches
-- an AI roll-up of unique points across every year's notes.

-- 1. Where a note came from. AI-generated notes are saved as NEW rows, never
--    written over an existing note, so the author can edit or delete the draft.
CREATE TYPE "public"."handoff_note_source" AS ENUM('manual', 'ai_generated');
--> statement-breakpoint

-- 2. Drop the one-note-per-year constraint. This is the whole point: history.
DROP INDEX IF EXISTS "board_handoff_notes_unique";
--> statement-breakpoint

-- 3. Optional label so two notes from the same year are tellable apart, plus
--    provenance for AI drafts (the raw bullets they were generated from).
ALTER TABLE "board_handoff_notes" ADD COLUMN IF NOT EXISTS "title" text;
--> statement-breakpoint
ALTER TABLE "board_handoff_notes" ADD COLUMN IF NOT EXISTS "source" "handoff_note_source" DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "board_handoff_notes" ADD COLUMN IF NOT EXISTS "raw_notes" text;
--> statement-breakpoint

-- 4. The unique index was also the lookup index; replace it with a plain one.
CREATE INDEX IF NOT EXISTS "board_handoff_notes_position_idx"
  ON "board_handoff_notes" ("school_id","position","school_year");
--> statement-breakpoint

-- 5. Cached cross-year roll-up, one row per school + position. Regenerated on
--    demand rather than per page load — summarizing 5 years of notes is a real
--    model call, and the answer only changes when someone writes a new note.
CREATE TABLE IF NOT EXISTS "board_handoff_summaries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "position" "pta_board_position" NOT NULL,
  "content" text,
  "source_note_ids" text,
  "note_count" integer DEFAULT 0 NOT NULL,
  "year_range" text,
  "generated_at" timestamp with time zone,
  "generated_by" uuid
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "board_handoff_summaries" ADD CONSTRAINT "board_handoff_summaries_school_id_schools_id_fk"
    FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "board_handoff_summaries" ADD CONSTRAINT "board_handoff_summaries_generated_by_users_id_fk"
    FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "board_handoff_summaries_unique"
  ON "board_handoff_summaries" ("school_id","position");
