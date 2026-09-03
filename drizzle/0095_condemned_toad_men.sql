ALTER TABLE "volunteer_hours" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "volunteer_hours" ADD COLUMN "volunteer_name" text;--> statement-breakpoint
ALTER TABLE "volunteer_hours" ADD COLUMN "volunteer_email" text;--> statement-breakpoint
ALTER TABLE "volunteer_hours" ADD COLUMN "logged_by" uuid;--> statement-breakpoint
ALTER TABLE "volunteer_hours" ADD CONSTRAINT "volunteer_hours_logged_by_users_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "volunteer_hours_volunteer_email_idx" ON "volunteer_hours" USING btree ("volunteer_email");--> statement-breakpoint
ALTER TABLE "volunteer_hours" ADD CONSTRAINT "volunteer_hours_identity" CHECK ("volunteer_hours"."user_id" IS NOT NULL OR "volunteer_hours"."volunteer_name" IS NOT NULL);