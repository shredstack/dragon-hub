ALTER TABLE "calendar_events" ADD COLUMN "time_zone" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "all_day" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "school_calendar_integrations" ADD COLUMN "time_zone" text;