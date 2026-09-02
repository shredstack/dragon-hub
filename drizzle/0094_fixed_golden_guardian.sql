ALTER TABLE "event_plan_wrap_ups" ADD COLUMN "tips" text;--> statement-breakpoint
ALTER TABLE "event_plan_wrap_ups" ADD COLUMN "applied_tips" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "event_plan_settings" jsonb;