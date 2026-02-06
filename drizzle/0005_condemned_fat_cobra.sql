CREATE TYPE "public"."calendar_type" AS ENUM('pta', 'school');--> statement-breakpoint
ALTER TABLE "school_calendar_integrations" ADD COLUMN "calendar_type" "calendar_type" DEFAULT 'pta';