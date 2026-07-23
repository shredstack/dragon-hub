CREATE TYPE "public"."committee_capacity_mode" AS ENUM('open', 'capped');--> statement-breakpoint
CREATE TYPE "public"."committee_member_role" AS ENUM('chair', 'member');--> statement-breakpoint
CREATE TYPE "public"."committee_scope" AS ENUM('school', 'classroom', 'event_plan');--> statement-breakpoint
CREATE TYPE "public"."committee_signup_status" AS ENUM('active', 'waitlisted', 'removed');--> statement-breakpoint
CREATE TYPE "public"."committee_status" AS ENUM('draft', 'active', 'closed');--> statement-breakpoint
CREATE TABLE "committee_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"committee_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "committee_member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "committee_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"committee_id" uuid NOT NULL,
	"author_id" uuid,
	"message" text NOT NULL,
	"chairs_only" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "committee_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"committee_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"role" "committee_member_role" DEFAULT 'member' NOT NULL,
	"willing_to_chair" boolean DEFAULT false NOT NULL,
	"notes" text,
	"school_year" text NOT NULL,
	"signup_source" "volunteer_signup_source" DEFAULT 'qr_code' NOT NULL,
	"status" "committee_signup_status" DEFAULT 'active' NOT NULL,
	"waitlisted_at" timestamp with time zone,
	"promoted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"removed_at" timestamp with time zone,
	"removed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "committee_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"committee_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assigned_to" uuid,
	"completed" boolean DEFAULT false NOT NULL,
	"due_date" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "committees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"school_year" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"responsibilities" text,
	"typical_timing" text,
	"time_commitment" text,
	"icon_emoji" text,
	"image_url" text,
	"scope" "committee_scope" DEFAULT 'school' NOT NULL,
	"classroom_id" uuid,
	"event_plan_id" uuid,
	"grants_linked_access" boolean DEFAULT false NOT NULL,
	"join_code" text NOT NULL,
	"show_on_room_parent_signup" boolean DEFAULT false NOT NULL,
	"capacity_mode" "committee_capacity_mode" DEFAULT 'open' NOT NULL,
	"min_size" integer,
	"max_size" integer,
	"waitlist_enabled" boolean DEFAULT true NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"owner_position" "pta_board_position",
	"contact_email" text,
	"status" "committee_status" DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"lineage_id" uuid,
	"rolled_from_id" uuid,
	"created_by" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "committees_join_code_unique" UNIQUE("join_code"),
	CONSTRAINT "committees_scope_target_check" CHECK (("committees"."scope" = 'school'     AND "committees"."classroom_id" IS NULL     AND "committees"."event_plan_id" IS NULL)
       OR ("committees"."scope" = 'classroom'  AND "committees"."classroom_id" IS NOT NULL AND "committees"."event_plan_id" IS NULL)
       OR ("committees"."scope" = 'event_plan' AND "committees"."event_plan_id" IS NOT NULL AND "committees"."classroom_id" IS NULL)),
	CONSTRAINT "committees_capacity_check" CHECK ("committees"."capacity_mode" = 'open'
       OR ("committees"."capacity_mode" = 'capped' AND "committees"."max_size" IS NOT NULL AND "committees"."max_size" > 0))
);
--> statement-breakpoint
ALTER TABLE "committee_members" ADD CONSTRAINT "committee_members_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_members" ADD CONSTRAINT "committee_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_messages" ADD CONSTRAINT "committee_messages_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_messages" ADD CONSTRAINT "committee_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_signups" ADD CONSTRAINT "committee_signups_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_signups" ADD CONSTRAINT "committee_signups_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_signups" ADD CONSTRAINT "committee_signups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_signups" ADD CONSTRAINT "committee_signups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_signups" ADD CONSTRAINT "committee_signups_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_tasks" ADD CONSTRAINT "committee_tasks_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_tasks" ADD CONSTRAINT "committee_tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_tasks" ADD CONSTRAINT "committee_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committees" ADD CONSTRAINT "committees_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committees" ADD CONSTRAINT "committees_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committees" ADD CONSTRAINT "committees_event_plan_id_event_plans_id_fk" FOREIGN KEY ("event_plan_id") REFERENCES "public"."event_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committees" ADD CONSTRAINT "committees_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committees" ADD CONSTRAINT "committees_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "committee_members_unique" ON "committee_members" USING btree ("committee_id","user_id");--> statement-breakpoint
CREATE INDEX "committee_members_user_idx" ON "committee_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "committee_signups_committee_idx" ON "committee_signups" USING btree ("committee_id");--> statement-breakpoint
CREATE INDEX "committee_signups_email_idx" ON "committee_signups" USING btree ("email");--> statement-breakpoint
CREATE INDEX "committee_signups_waitlist_idx" ON "committee_signups" USING btree ("committee_id","waitlisted_at");--> statement-breakpoint
CREATE INDEX "committees_school_year_idx" ON "committees" USING btree ("school_id","school_year");--> statement-breakpoint
CREATE UNIQUE INDEX "committees_school_year_name_unique" ON "committees" USING btree ("school_id","school_year","name");--> statement-breakpoint
CREATE INDEX "committees_lineage_idx" ON "committees" USING btree ("lineage_id");--> statement-breakpoint
-- Hand-written: drizzle-kit won't emit the partial predicate.
--
-- Nobody may hold a seat and a place in line at the same time, so the index
-- covers 'waitlisted' as well as 'active'. It omits `role` — a person holds
-- exactly one role per committee, and a promotion to chair is an UPDATE, not a
-- second row. `removed` rows stay unconstrained so re-signup history can
-- accumulate harmlessly. Same spirit as `volunteer_signups_unique_active`.
CREATE UNIQUE INDEX "committee_signups_unique_open"
  ON "committee_signups" ("committee_id", "email")
  WHERE status IN ('active', 'waitlisted');