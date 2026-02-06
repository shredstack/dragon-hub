CREATE TYPE "public"."task_timing_tag" AS ENUM('day_of', 'days_before', 'week_plus_before');--> statement-breakpoint
CREATE TABLE "drive_file_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"file_id" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text,
	"parent_folder_id" text,
	"text_content" text,
	"last_indexed_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "event_plan_ai_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_plan_id" uuid NOT NULL,
	"title" text NOT NULL,
	"additional_context" text,
	"response" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "event_plan_tasks" ADD COLUMN "timing_tag" "task_timing_tag";--> statement-breakpoint
ALTER TABLE "drive_file_index" ADD CONSTRAINT "drive_file_index_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_plan_ai_recommendations" ADD CONSTRAINT "event_plan_ai_recommendations_event_plan_id_event_plans_id_fk" FOREIGN KEY ("event_plan_id") REFERENCES "public"."event_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_plan_ai_recommendations" ADD CONSTRAINT "event_plan_ai_recommendations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drive_file_index_unique" ON "drive_file_index" USING btree ("school_id","file_id");