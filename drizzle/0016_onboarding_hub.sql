-- Onboarding Hub Migration
-- Creates tables for board member onboarding: resources, checklists, handoff notes, AI guides, and event catalog

-- Enum for AI guide generation status
CREATE TYPE "public"."onboarding_guide_status" AS ENUM('generating', 'ready', 'failed');

-- 1. Onboarding Resources - External links by board position
CREATE TABLE "onboarding_resources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "position" "pta_board_position",
  "title" text NOT NULL,
  "url" text NOT NULL,
  "description" text,
  "category" text,
  "sort_order" integer DEFAULT 0,
  "active" boolean DEFAULT true,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

-- 2. Onboarding Checklist Items - Templates per role
CREATE TABLE "onboarding_checklist_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "position" "pta_board_position",
  "title" text NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0,
  "active" boolean DEFAULT true,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now()
);

-- 3. Onboarding Progress - Per-user checklist completion
CREATE TABLE "onboarding_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "checklist_item_id" uuid NOT NULL REFERENCES "onboarding_checklist_items"("id") ON DELETE CASCADE,
  "school_year" text NOT NULL,
  "completed_at" timestamp with time zone DEFAULT now()
);
CREATE UNIQUE INDEX "onboarding_progress_unique" ON "onboarding_progress" USING btree ("user_id", "checklist_item_id", "school_year");

-- 4. Board Handoff Notes - Outgoing member handoff notes
CREATE TABLE "board_handoff_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "position" "pta_board_position" NOT NULL,
  "school_year" text NOT NULL,
  "from_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "to_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "key_accomplishments" text,
  "ongoing_projects" text,
  "tips_and_advice" text,
  "important_contacts" text,
  "files_and_resources" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
CREATE UNIQUE INDEX "board_handoff_notes_unique" ON "board_handoff_notes" USING btree ("school_id", "position", "school_year");

-- 5. Onboarding Guides - AI-generated guides (cached)
CREATE TABLE "onboarding_guides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "position" "pta_board_position" NOT NULL,
  "school_year" text NOT NULL,
  "status" "onboarding_guide_status" DEFAULT 'generating' NOT NULL,
  "content" text,
  "sources_used" text,
  "knowledge_article_id" uuid REFERENCES "knowledge_articles"("id") ON DELETE SET NULL,
  "generated_at" timestamp with time zone,
  "generated_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE UNIQUE INDEX "onboarding_guides_unique" ON "onboarding_guides" USING btree ("school_id", "position", "school_year");

-- 6. Event Catalog - AI-generated event summaries
CREATE TABLE "event_catalog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "typical_timing" text,
  "estimated_volunteers" text,
  "estimated_budget" text,
  "key_tasks" text,
  "tips" text,
  "related_positions" "pta_board_position"[],
  "source_event_plan_ids" uuid[],
  "ai_generated" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
CREATE UNIQUE INDEX "event_catalog_unique" ON "event_catalog" USING btree ("school_id", "event_type");

-- 7. Event Interest - Board member event preferences
CREATE TABLE "event_interest" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event_catalog_id" uuid NOT NULL REFERENCES "event_catalog"("id") ON DELETE CASCADE,
  "school_year" text NOT NULL,
  "interest_level" text NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE UNIQUE INDEX "event_interest_unique" ON "event_interest" USING btree ("user_id", "event_catalog_id", "school_year");
