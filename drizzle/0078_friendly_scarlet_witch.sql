CREATE TYPE "public"."mailing_status" AS ENUM('draft', 'sending', 'done');--> statement-breakpoint
CREATE TABLE "mailing_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mailing_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"blob_url" text NOT NULL,
	"file_size" integer,
	"content_type" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mailing_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mailing_id" uuid NOT NULL,
	"group_key" text NOT NULL,
	"name" text NOT NULL,
	"classroom_ids" uuid[],
	"recipients" jsonb,
	"variables" jsonb,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"sent_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mailings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"title" text NOT NULL,
	"subject_template" text DEFAULT '' NOT NULL,
	"body_template" text DEFAULT '' NOT NULL,
	"audience" jsonb,
	"roster_preset_id" text,
	"status" "mailing_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "mailing_attachments" ADD CONSTRAINT "mailing_attachments_mailing_id_mailings_id_fk" FOREIGN KEY ("mailing_id") REFERENCES "public"."mailings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailing_attachments" ADD CONSTRAINT "mailing_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailing_groups" ADD CONSTRAINT "mailing_groups_mailing_id_mailings_id_fk" FOREIGN KEY ("mailing_id") REFERENCES "public"."mailings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailing_groups" ADD CONSTRAINT "mailing_groups_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailings" ADD CONSTRAINT "mailings_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailings" ADD CONSTRAINT "mailings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mailing_attachments_mailing_idx" ON "mailing_attachments" USING btree ("mailing_id");--> statement-breakpoint
CREATE INDEX "mailing_groups_mailing_idx" ON "mailing_groups" USING btree ("mailing_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "mailing_groups_unique_key" ON "mailing_groups" USING btree ("mailing_id","group_key");--> statement-breakpoint
CREATE INDEX "mailings_school_idx" ON "mailings" USING btree ("school_id","created_at");