CREATE TYPE "public"."event_help_request_status" AS ENUM('pending', 'approved', 'waitlisted', 'declined');--> statement-breakpoint
CREATE TABLE "event_catalog_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"event_catalog_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reaction" text NOT NULL,
	"school_year" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "event_help_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"event_catalog_id" uuid NOT NULL,
	"event_plan_id" uuid,
	"school_year" text NOT NULL,
	"message" text,
	"status" "event_help_request_status" DEFAULT 'pending' NOT NULL,
	"waitlisted_at" timestamp with time zone,
	"promoted_at" timestamp with time zone,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "event_catalog" ADD COLUMN "show_in_directory" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "event_catalog" ADD COLUMN "help_cap" integer;--> statement-breakpoint
ALTER TABLE "event_catalog" ADD COLUMN "help_waitlist_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "event_directory_settings" jsonb;--> statement-breakpoint
ALTER TABLE "event_catalog_reactions" ADD CONSTRAINT "event_catalog_reactions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_catalog_reactions" ADD CONSTRAINT "event_catalog_reactions_event_catalog_id_event_catalog_id_fk" FOREIGN KEY ("event_catalog_id") REFERENCES "public"."event_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_catalog_reactions" ADD CONSTRAINT "event_catalog_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_help_requests" ADD CONSTRAINT "event_help_requests_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_help_requests" ADD CONSTRAINT "event_help_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_help_requests" ADD CONSTRAINT "event_help_requests_event_catalog_id_event_catalog_id_fk" FOREIGN KEY ("event_catalog_id") REFERENCES "public"."event_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_help_requests" ADD CONSTRAINT "event_help_requests_event_plan_id_event_plans_id_fk" FOREIGN KEY ("event_plan_id") REFERENCES "public"."event_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_help_requests" ADD CONSTRAINT "event_help_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_catalog_reactions_unique" ON "event_catalog_reactions" USING btree ("user_id","event_catalog_id","reaction");--> statement-breakpoint
CREATE INDEX "event_catalog_reactions_catalog_idx" ON "event_catalog_reactions" USING btree ("event_catalog_id","reaction");--> statement-breakpoint
CREATE UNIQUE INDEX "event_help_requests_unique" ON "event_help_requests" USING btree ("user_id","event_catalog_id","school_year");--> statement-breakpoint
CREATE INDEX "event_help_requests_queue_idx" ON "event_help_requests" USING btree ("school_id","school_year","status");--> statement-breakpoint
CREATE INDEX "event_help_requests_line_idx" ON "event_help_requests" USING btree ("event_catalog_id","status","waitlisted_at");