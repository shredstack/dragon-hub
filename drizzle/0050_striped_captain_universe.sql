CREATE TYPE "public"."committee_slot_status" AS ENUM('proposed', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TABLE "committee_schedule_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"committee_id" uuid NOT NULL,
	"title" text NOT NULL,
	"classroom_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"location" text,
	"notes" text,
	"assigned_signup_id" uuid,
	"status" "committee_slot_status" DEFAULT 'proposed' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "committee_signups" ADD COLUMN "classroom_id" uuid;--> statement-breakpoint
ALTER TABLE "committees" ADD COLUMN "show_per_classroom_on_signup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "committees" ADD COLUMN "per_classroom_limit" integer;--> statement-breakpoint
ALTER TABLE "committees" ADD COLUMN "scheduling_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "committee_schedule_slots" ADD CONSTRAINT "committee_schedule_slots_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_schedule_slots" ADD CONSTRAINT "committee_schedule_slots_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_schedule_slots" ADD CONSTRAINT "committee_schedule_slots_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_schedule_slots" ADD CONSTRAINT "committee_schedule_slots_assigned_signup_id_committee_signups_id_fk" FOREIGN KEY ("assigned_signup_id") REFERENCES "public"."committee_signups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_schedule_slots" ADD CONSTRAINT "committee_schedule_slots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "committee_schedule_slots_committee_idx" ON "committee_schedule_slots" USING btree ("committee_id");--> statement-breakpoint
CREATE INDEX "committee_schedule_slots_time_idx" ON "committee_schedule_slots" USING btree ("committee_id","starts_at");--> statement-breakpoint
ALTER TABLE "committee_signups" ADD CONSTRAINT "committee_signups_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committees" ADD CONSTRAINT "committees_signup_placement_check" CHECK (NOT ("committees"."show_on_room_parent_signup" AND "committees"."show_per_classroom_on_signup"));--> statement-breakpoint
--> Hand-added: serves the per-classroom capacity count on every per-classroom
--> committee signup. Partial (live rows only) so it stays small; drizzle-kit
--> won't emit the WHERE predicate, so it lives here.
CREATE INDEX "committee_signups_committee_classroom_idx" ON "committee_signups" USING btree ("committee_id","classroom_id") WHERE "status" IN ('active', 'waitlisted');