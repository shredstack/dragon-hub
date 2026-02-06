CREATE TABLE "school_calendar_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"calendar_id" text NOT NULL,
	"name" text,
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "school_drive_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"folder_id" text NOT NULL,
	"name" text,
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "school_calendar_integrations" ADD CONSTRAINT "school_calendar_integrations_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_calendar_integrations" ADD CONSTRAINT "school_calendar_integrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_drive_integrations" ADD CONSTRAINT "school_drive_integrations_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_drive_integrations" ADD CONSTRAINT "school_drive_integrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "school_calendar_unique" ON "school_calendar_integrations" USING btree ("school_id","calendar_id");--> statement-breakpoint
CREATE UNIQUE INDEX "school_drive_unique" ON "school_drive_integrations" USING btree ("school_id","folder_id");