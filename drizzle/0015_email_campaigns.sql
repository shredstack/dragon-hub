-- Email Campaign Enums
CREATE TYPE "public"."email_campaign_status" AS ENUM('draft', 'review', 'sent');
CREATE TYPE "public"."email_audience" AS ENUM('all', 'pta_only');
CREATE TYPE "public"."email_content_status" AS ENUM('pending', 'included', 'skipped');
CREATE TYPE "public"."email_section_type" AS ENUM('recurring', 'custom', 'calendar_summary');

-- Email Campaigns table
CREATE TABLE "email_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "week_start" date NOT NULL,
  "week_end" date NOT NULL,
  "status" "email_campaign_status" DEFAULT 'draft' NOT NULL,
  "pta_html" text,
  "school_html" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "sent_at" timestamp with time zone,
  "sent_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

-- Email Sections table
CREATE TABLE "email_sections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "email_campaigns"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "link_url" text,
  "link_text" text,
  "image_url" text,
  "image_alt" text,
  "image_link_url" text,
  "section_type" "email_section_type" DEFAULT 'custom' NOT NULL,
  "recurring_key" text,
  "audience" "email_audience" DEFAULT 'all' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "submitted_by" uuid REFERENCES "users"("id"),
  "source_content_item_id" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

-- Email Content Items table (board member submissions)
CREATE TABLE "email_content_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "link_url" text,
  "link_text" text,
  "audience" "email_audience" DEFAULT 'all' NOT NULL,
  "target_date" date,
  "status" "email_content_status" DEFAULT 'pending' NOT NULL,
  "included_in_campaign_id" uuid REFERENCES "email_campaigns"("id"),
  "submitted_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

-- Email Content Images table
CREATE TABLE "email_content_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "content_item_id" uuid NOT NULL REFERENCES "email_content_items"("id") ON DELETE CASCADE,
  "blob_url" text NOT NULL,
  "file_name" text NOT NULL,
  "file_size" integer,
  "sort_order" integer DEFAULT 0,
  "uploaded_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now()
);

-- Email Recurring Sections table (templates)
CREATE TABLE "email_recurring_sections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "title" text NOT NULL,
  "body_template" text NOT NULL,
  "link_url" text,
  "link_text" text,
  "image_url" text,
  "audience" "email_audience" DEFAULT 'all' NOT NULL,
  "default_sort_order" integer DEFAULT 99 NOT NULL,
  "active" boolean DEFAULT true,
  "updated_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamp with time zone DEFAULT now()
);

-- Unique index for recurring sections
CREATE UNIQUE INDEX "email_recurring_sections_school_key" ON "email_recurring_sections" USING btree ("school_id", "key");
