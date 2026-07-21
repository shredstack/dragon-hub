-- Volunteer interest campaigns.
--
-- The existing room parent signup (schools.volunteer_qr_code -> volunteer_signups)
-- is hardcoded to two roles and one QR code per school. This adds the general-PTA
-- counterpart: any board member configures a campaign — a titled, described list
-- of events with their own QR code — and parents flag which ones they'd consider
-- helping with. It replaces the paper flyer that goes home with students.
--
-- Interest here is deliberately non-binding. Actual time-slot commitment still
-- happens in SignUpGenius closer to the event (see event_plans.signup_genius_url).

-- 1. Campaign lifecycle. Draft campaigns are invisible to parents.
CREATE TYPE "public"."volunteer_campaign_status" AS ENUM('draft', 'active', 'closed');
--> statement-breakpoint

-- 2. How much a parent wants in: "call me if you need hands" vs "I'll help run it".
CREATE TYPE "public"."volunteer_interest_level" AS ENUM('interested', 'lead');
--> statement-breakpoint

-- 3. Campaigns. A school can run several at once (Fun Run VP, Hospitality, ...).
CREATE TABLE IF NOT EXISTS "volunteer_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "qr_code" text NOT NULL,
  "title" text NOT NULL,
  "intro" text,
  "school_year" text NOT NULL,
  "status" "volunteer_campaign_status" DEFAULT 'draft' NOT NULL,
  "show_on_room_parent_signup" boolean DEFAULT false NOT NULL,
  "owner_position" "pta_board_position",
  "contact_email" text,
  "opens_at" timestamp with time zone,
  "closes_at" timestamp with time zone,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "volunteer_campaigns_qr_code_unique" UNIQUE("qr_code")
);
--> statement-breakpoint

-- 4. The events listed on a campaign page. event_catalog_id / event_plan_id are
--    provenance links only — editing this flyer copy never mutates the catalog,
--    which is keyed one-row-per-event-type and holds institutional knowledge.
CREATE TABLE IF NOT EXISTS "volunteer_campaign_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "volunteer_responsibilities" text,
  "typical_timing" text,
  "time_commitment" text,
  "icon_emoji" text,
  "image_url" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "event_catalog_id" uuid,
  "event_plan_id" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

-- 5. Interest rows. user_id is nullable because most are created by parents who
--    have no account yet — same pattern as volunteer_signups.
CREATE TABLE IF NOT EXISTS "volunteer_interests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "campaign_event_id" uuid NOT NULL,
  "user_id" uuid,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "phone" text,
  "interest_level" "volunteer_interest_level" DEFAULT 'interested' NOT NULL,
  "notes" text,
  "school_year" text NOT NULL,
  "signup_source" "volunteer_signup_source" DEFAULT 'qr_code' NOT NULL,
  "status" "volunteer_signup_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "removed_at" timestamp with time zone,
  "removed_by" uuid
);
--> statement-breakpoint

-- 6. Foreign keys.
ALTER TABLE "volunteer_campaigns" ADD CONSTRAINT "volunteer_campaigns_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_campaigns" ADD CONSTRAINT "volunteer_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "volunteer_campaign_events" ADD CONSTRAINT "volunteer_campaign_events_campaign_id_volunteer_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."volunteer_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_campaign_events" ADD CONSTRAINT "volunteer_campaign_events_event_catalog_id_event_catalog_id_fk" FOREIGN KEY ("event_catalog_id") REFERENCES "public"."event_catalog"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_campaign_events" ADD CONSTRAINT "volunteer_campaign_events_event_plan_id_event_plans_id_fk" FOREIGN KEY ("event_plan_id") REFERENCES "public"."event_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "volunteer_interests" ADD CONSTRAINT "volunteer_interests_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_interests" ADD CONSTRAINT "volunteer_interests_campaign_id_volunteer_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."volunteer_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_interests" ADD CONSTRAINT "volunteer_interests_campaign_event_id_volunteer_campaign_events_id_fk" FOREIGN KEY ("campaign_event_id") REFERENCES "public"."volunteer_campaign_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_interests" ADD CONSTRAINT "volunteer_interests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_interests" ADD CONSTRAINT "volunteer_interests_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- 7. Indexes. The unique index is what makes re-submitting the form idempotent:
--    a parent who scans twice updates their interest level instead of duplicating.
CREATE UNIQUE INDEX IF NOT EXISTS "volunteer_interests_unique" ON "volunteer_interests" ("campaign_event_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "volunteer_interests_campaign_idx" ON "volunteer_interests" ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "volunteer_campaigns_school_year_idx" ON "volunteer_campaigns" ("school_id","school_year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "volunteer_campaign_events_campaign_idx" ON "volunteer_campaign_events" ("campaign_id");--> statement-breakpoint

-- 8. SignUpGenius link on event plans, so the event detail page is the one place
--    to find "where do I actually claim a time slot".
ALTER TABLE "event_plans" ADD COLUMN IF NOT EXISTS "signup_genius_url" text;
