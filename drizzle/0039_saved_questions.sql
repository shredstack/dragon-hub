-- Saved Q&As from "Ask DragonHub".
--
-- The answer and its citations are snapshotted at save time rather than
-- re-derived on read: the point of saving is getting the answer back
-- instantly, and re-running the model would cost a call and could return
-- something other than what the saver vouched for.
--
-- visibility defaults to 'shared' because the reason to keep an answer is so
-- the next board member doesn't have to ask it again; 'private' is the
-- deliberate choice.
--
-- Written by hand because drizzle-kit generate can't run non-interactively on
-- this branch's pending diffs (snapshots stopped at 0007). Same as 0038.

DO $$ BEGIN
  CREATE TYPE "saved_qa_visibility" AS ENUM ('shared', 'private');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saved_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "question" text NOT NULL,
  "answer" text NOT NULL,
  "sources" jsonb,
  "confidence" text,
  "title" text,
  "visibility" "saved_qa_visibility" DEFAULT 'shared' NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "saved_questions" ADD CONSTRAINT "saved_questions_school_id_fk"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "saved_questions" ADD CONSTRAINT "saved_questions_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_questions_school_idx" ON "saved_questions" ("school_id", "visibility");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_questions_created_by_idx" ON "saved_questions" ("created_by");
