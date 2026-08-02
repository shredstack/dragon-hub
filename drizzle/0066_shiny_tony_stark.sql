ALTER TABLE "classroom_messages" DROP CONSTRAINT IF EXISTS "classroom_messages_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "classroom_tasks" DROP CONSTRAINT IF EXISTS "classroom_tasks_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "classroom_tasks" DROP CONSTRAINT IF EXISTS "classroom_tasks_assigned_to_users_id_fk";
--> statement-breakpoint
ALTER TABLE "committee_signups" DROP CONSTRAINT IF EXISTS "committee_signups_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "committee_signups" DROP CONSTRAINT IF EXISTS "committee_signups_removed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "committees" DROP CONSTRAINT IF EXISTS "committees_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "district_onboarding_resources" DROP CONSTRAINT IF EXISTS "district_onboarding_resources_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "email_campaigns" DROP CONSTRAINT IF EXISTS "email_campaigns_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "email_campaigns" DROP CONSTRAINT IF EXISTS "email_campaigns_sent_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "email_content_images" DROP CONSTRAINT IF EXISTS "email_content_images_uploaded_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "email_content_items" DROP CONSTRAINT IF EXISTS "email_content_items_submitted_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "email_recurring_sections" DROP CONSTRAINT IF EXISTS "email_recurring_sections_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "email_sections" DROP CONSTRAINT IF EXISTS "email_sections_submitted_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "event_flyers" DROP CONSTRAINT IF EXISTS "event_flyers_uploaded_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "event_plan_ai_recommendations" DROP CONSTRAINT IF EXISTS "event_plan_ai_recommendations_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "event_plan_invites" DROP CONSTRAINT IF EXISTS "event_plan_invites_invited_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "event_plan_meeting_images" DROP CONSTRAINT IF EXISTS "event_plan_meeting_images_uploaded_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "event_plan_meeting_notes" DROP CONSTRAINT IF EXISTS "event_plan_meeting_notes_recorded_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "event_plan_meetings" DROP CONSTRAINT IF EXISTS "event_plan_meetings_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "event_plan_messages" DROP CONSTRAINT IF EXISTS "event_plan_messages_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "event_plan_resources" DROP CONSTRAINT IF EXISTS "event_plan_resources_added_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "event_plan_tasks" DROP CONSTRAINT IF EXISTS "event_plan_tasks_assigned_to_users_id_fk";
--> statement-breakpoint
ALTER TABLE "event_plan_tasks" DROP CONSTRAINT IF EXISTS "event_plan_tasks_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "important_links" DROP CONSTRAINT IF EXISTS "important_links_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "knowledge_articles" DROP CONSTRAINT IF EXISTS "knowledge_articles_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "media_library" DROP CONSTRAINT IF EXISTS "media_library_uploaded_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "onboarding_checklist_items" DROP CONSTRAINT IF EXISTS "onboarding_checklist_items_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "onboarding_guides" DROP CONSTRAINT IF EXISTS "onboarding_guides_generated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "onboarding_resources" DROP CONSTRAINT IF EXISTS "onboarding_resources_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "pta_agendas" DROP CONSTRAINT IF EXISTS "pta_agendas_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "pta_minutes" DROP CONSTRAINT IF EXISTS "pta_minutes_approved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "scavenger_hunts" DROP CONSTRAINT IF EXISTS "scavenger_hunts_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "school_budget_integrations" DROP CONSTRAINT IF EXISTS "school_budget_integrations_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "school_calendar_integrations" DROP CONSTRAINT IF EXISTS "school_calendar_integrations_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "school_drive_integrations" DROP CONSTRAINT IF EXISTS "school_drive_integrations_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "school_google_integrations" DROP CONSTRAINT IF EXISTS "school_google_integrations_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "school_join_codes" DROP CONSTRAINT IF EXISTS "school_join_codes_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "school_memberships" DROP CONSTRAINT IF EXISTS "school_memberships_invited_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "schools" DROP CONSTRAINT IF EXISTS "schools_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "state_onboarding_resources" DROP CONSTRAINT IF EXISTS "state_onboarding_resources_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "super_admins" DROP CONSTRAINT IF EXISTS "super_admins_granted_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "volunteer_campaigns" DROP CONSTRAINT IF EXISTS "volunteer_campaigns_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "volunteer_hours" DROP CONSTRAINT IF EXISTS "volunteer_hours_approved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "volunteer_interests" DROP CONSTRAINT IF EXISTS "volunteer_interests_removed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "volunteer_signups" DROP CONSTRAINT IF EXISTS "volunteer_signups_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "volunteer_signups" DROP CONSTRAINT IF EXISTS "volunteer_signups_removed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "committees" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "email_campaigns" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "email_content_images" ALTER COLUMN "uploaded_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "email_content_items" ALTER COLUMN "submitted_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "event_flyers" ALTER COLUMN "uploaded_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "event_plan_ai_recommendations" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "event_plan_meeting_notes" ALTER COLUMN "recorded_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "event_plan_meetings" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "media_library" ALTER COLUMN "uploaded_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pta_agendas" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scavenger_hunts" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "volunteer_campaigns" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "classroom_messages" ADD CONSTRAINT "classroom_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_tasks" ADD CONSTRAINT "classroom_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_tasks" ADD CONSTRAINT "classroom_tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_signups" ADD CONSTRAINT "committee_signups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_signups" ADD CONSTRAINT "committee_signups_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committees" ADD CONSTRAINT "committees_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "district_onboarding_resources" ADD CONSTRAINT "district_onboarding_resources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_content_images" ADD CONSTRAINT "email_content_images_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_content_items" ADD CONSTRAINT "email_content_items_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_recurring_sections" ADD CONSTRAINT "email_recurring_sections_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sections" ADD CONSTRAINT "email_sections_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_flyers" ADD CONSTRAINT "event_flyers_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_plan_ai_recommendations" ADD CONSTRAINT "event_plan_ai_recommendations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_plan_invites" ADD CONSTRAINT "event_plan_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_plan_meeting_images" ADD CONSTRAINT "event_plan_meeting_images_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_plan_meeting_notes" ADD CONSTRAINT "event_plan_meeting_notes_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_plan_meetings" ADD CONSTRAINT "event_plan_meetings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_plan_messages" ADD CONSTRAINT "event_plan_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_plan_resources" ADD CONSTRAINT "event_plan_resources_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_plan_tasks" ADD CONSTRAINT "event_plan_tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_plan_tasks" ADD CONSTRAINT "event_plan_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "important_links" ADD CONSTRAINT "important_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_library" ADD CONSTRAINT "media_library_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_checklist_items" ADD CONSTRAINT "onboarding_checklist_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_guides" ADD CONSTRAINT "onboarding_guides_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_resources" ADD CONSTRAINT "onboarding_resources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pta_agendas" ADD CONSTRAINT "pta_agendas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pta_minutes" ADD CONSTRAINT "pta_minutes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scavenger_hunts" ADD CONSTRAINT "scavenger_hunts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_budget_integrations" ADD CONSTRAINT "school_budget_integrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_calendar_integrations" ADD CONSTRAINT "school_calendar_integrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_drive_integrations" ADD CONSTRAINT "school_drive_integrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_google_integrations" ADD CONSTRAINT "school_google_integrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_join_codes" ADD CONSTRAINT "school_join_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_onboarding_resources" ADD CONSTRAINT "state_onboarding_resources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_admins" ADD CONSTRAINT "super_admins_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_campaigns" ADD CONSTRAINT "volunteer_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_hours" ADD CONSTRAINT "volunteer_hours_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_interests" ADD CONSTRAINT "volunteer_interests_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_signups" ADD CONSTRAINT "volunteer_signups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_signups" ADD CONSTRAINT "volunteer_signups_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;