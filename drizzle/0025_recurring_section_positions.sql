-- Add position type enum for recurring email sections
CREATE TYPE "public"."section_position_type" AS ENUM('from_start', 'from_end');

-- Add position fields to email_recurring_sections
ALTER TABLE "email_recurring_sections" ADD COLUMN "position_type" "section_position_type" DEFAULT 'from_end' NOT NULL;
ALTER TABLE "email_recurring_sections" ADD COLUMN "position_index" integer DEFAULT 0 NOT NULL;
