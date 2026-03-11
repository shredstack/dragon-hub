-- Add meeting_room column to event_plan_meetings table
-- This allows specifying an optional room/location within an address (e.g., "Room 101", "Library")

ALTER TABLE "event_plan_meetings" ADD COLUMN "meeting_room" text;
