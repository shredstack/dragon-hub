ALTER TABLE "calendar_events" DROP CONSTRAINT IF EXISTS "calendar_events_pta_description_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_pta_description_updated_by_users_id_fk" FOREIGN KEY ("pta_description_updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
/*
  Hand-written half. Nineteen of these foreign keys were created outside
  `drizzle-kit generate` (by `push`, or by hand), so Postgres named them
  `<table>_<column>_fkey` rather than drizzle's `<table>_<column>_users_id_fk`.
  0066 drops by the drizzle name, misses these, and adds a *second* foreign key
  on the same column — leaving the original ON DELETE NO ACTION copy in place
  to go on blocking account deletion exactly as before. Dropping the legacy
  names is the only thing that actually retires them.

  IF EXISTS throughout: which of the two names a given database has depends on
  how that column got created there, and both are expected.
*/
ALTER TABLE "district_onboarding_resources" DROP CONSTRAINT IF EXISTS "district_onboarding_resources_created_by_fkey";--> statement-breakpoint
ALTER TABLE "email_campaigns" DROP CONSTRAINT IF EXISTS "email_campaigns_created_by_fkey";--> statement-breakpoint
ALTER TABLE "email_campaigns" DROP CONSTRAINT IF EXISTS "email_campaigns_sent_by_fkey";--> statement-breakpoint
ALTER TABLE "email_content_images" DROP CONSTRAINT IF EXISTS "email_content_images_uploaded_by_fkey";--> statement-breakpoint
ALTER TABLE "email_content_items" DROP CONSTRAINT IF EXISTS "email_content_items_submitted_by_fkey";--> statement-breakpoint
ALTER TABLE "email_recurring_sections" DROP CONSTRAINT IF EXISTS "email_recurring_sections_updated_by_fkey";--> statement-breakpoint
ALTER TABLE "email_sections" DROP CONSTRAINT IF EXISTS "email_sections_submitted_by_fkey";--> statement-breakpoint
ALTER TABLE "event_plan_meeting_images" DROP CONSTRAINT IF EXISTS "event_plan_meeting_images_uploaded_by_fkey";--> statement-breakpoint
ALTER TABLE "event_plan_meeting_notes" DROP CONSTRAINT IF EXISTS "event_plan_meeting_notes_recorded_by_fkey";--> statement-breakpoint
ALTER TABLE "event_plan_meetings" DROP CONSTRAINT IF EXISTS "event_plan_meetings_created_by_fkey";--> statement-breakpoint
ALTER TABLE "media_library" DROP CONSTRAINT IF EXISTS "media_library_uploaded_by_fkey";--> statement-breakpoint
ALTER TABLE "onboarding_checklist_items" DROP CONSTRAINT IF EXISTS "onboarding_checklist_items_created_by_fkey";--> statement-breakpoint
ALTER TABLE "onboarding_guides" DROP CONSTRAINT IF EXISTS "onboarding_guides_generated_by_fkey";--> statement-breakpoint
ALTER TABLE "onboarding_resources" DROP CONSTRAINT IF EXISTS "onboarding_resources_created_by_fkey";--> statement-breakpoint
ALTER TABLE "pta_agendas" DROP CONSTRAINT IF EXISTS "pta_agendas_created_by_fkey";--> statement-breakpoint
ALTER TABLE "pta_minutes" DROP CONSTRAINT IF EXISTS "pta_minutes_approved_by_fkey";--> statement-breakpoint
ALTER TABLE "state_onboarding_resources" DROP CONSTRAINT IF EXISTS "state_onboarding_resources_created_by_fkey";--> statement-breakpoint
ALTER TABLE "volunteer_signups" DROP CONSTRAINT IF EXISTS "volunteer_signups_created_by_fkey";--> statement-breakpoint
ALTER TABLE "volunteer_signups" DROP CONSTRAINT IF EXISTS "volunteer_signups_removed_by_fkey";
