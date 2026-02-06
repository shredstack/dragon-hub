CREATE TABLE "event_flyers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_event_id" uuid NOT NULL,
	"blob_url" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer,
	"sort_order" integer DEFAULT 0,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "pta_description" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "pta_description_updated_by" uuid;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "pta_description_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_flyers" ADD CONSTRAINT "event_flyers_calendar_event_id_calendar_events_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_flyers" ADD CONSTRAINT "event_flyers_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_pta_description_updated_by_users_id_fk" FOREIGN KEY ("pta_description_updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;