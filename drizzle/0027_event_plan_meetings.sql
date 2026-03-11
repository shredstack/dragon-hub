-- Event Plan Meetings: enums, tables, and indexes

-- Create enums
CREATE TYPE "public"."meeting_status" AS ENUM('scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE "public"."meeting_rsvp_status" AS ENUM('invited', 'accepted', 'declined', 'tentative');

-- Create event_plan_meetings table
CREATE TABLE IF NOT EXISTS "event_plan_meetings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_plan_id" uuid NOT NULL REFERENCES "event_plans"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "location" text NOT NULL,
  "meeting_date" timestamp with time zone NOT NULL,
  "start_time" text NOT NULL,
  "end_time" text,
  "topic" text NOT NULL,
  "agenda" text,
  "status" "meeting_status" DEFAULT 'scheduled' NOT NULL,
  "google_doc_url" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

-- Create event_plan_meeting_participants table
CREATE TABLE IF NOT EXISTS "event_plan_meeting_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "meeting_id" uuid NOT NULL REFERENCES "event_plan_meetings"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "rsvp_status" "meeting_rsvp_status" DEFAULT 'invited' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

-- Create unique index for participants
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_participants_unique" ON "event_plan_meeting_participants" ("meeting_id", "user_id");

-- Create event_plan_meeting_notes table
CREATE TABLE IF NOT EXISTS "event_plan_meeting_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "meeting_id" uuid NOT NULL REFERENCES "event_plan_meetings"("id") ON DELETE CASCADE,
  "content" text NOT NULL,
  "summary" text,
  "action_items" text,
  "attendees" text,
  "recorded_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

-- Create event_plan_meeting_images table
CREATE TABLE IF NOT EXISTS "event_plan_meeting_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "meeting_id" uuid NOT NULL REFERENCES "event_plan_meetings"("id") ON DELETE CASCADE,
  "blob_url" text NOT NULL,
  "file_name" text NOT NULL,
  "raw_transcription" text,
  "corrected_transcription" text,
  "organized_content" text,
  "confidence" text,
  "uploaded_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS "meetings_event_plan_idx" ON "event_plan_meetings" ("event_plan_id");
CREATE INDEX IF NOT EXISTS "meetings_date_idx" ON "event_plan_meetings" ("meeting_date");
CREATE INDEX IF NOT EXISTS "meeting_notes_meeting_idx" ON "event_plan_meeting_notes" ("meeting_id");
CREATE INDEX IF NOT EXISTS "meeting_images_meeting_idx" ON "event_plan_meeting_images" ("meeting_id");
