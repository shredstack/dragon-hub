-- Volunteer Signup System Migration
-- Adds QR code volunteer signup, party volunteer tracking, and private room parent message boards

-- 1. Create enums for volunteer system
CREATE TYPE "public"."volunteer_signup_source" AS ENUM('qr_code', 'manual');
CREATE TYPE "public"."volunteer_signup_status" AS ENUM('active', 'removed');
CREATE TYPE "public"."volunteer_role" AS ENUM('room_parent', 'party_volunteer');
CREATE TYPE "public"."message_access_level" AS ENUM('public', 'room_parents_only');

-- 2. Add volunteer signup fields to schools table
ALTER TABLE "schools" ADD COLUMN "volunteer_qr_code" text UNIQUE;
ALTER TABLE "schools" ADD COLUMN "volunteer_settings" jsonb DEFAULT '{"roomParentLimit": 2, "partyTypes": ["halloween", "valentines"], "enabled": true}'::jsonb;

-- 3. Create volunteer_signups table
-- This tracks both room parents and party volunteers for each classroom
CREATE TABLE "volunteer_signups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "classroom_id" uuid NOT NULL REFERENCES "classrooms"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "phone" text,
  "role" "volunteer_role" NOT NULL,
  "party_types" text[],
  "signup_source" "volunteer_signup_source" NOT NULL DEFAULT 'qr_code',
  "status" "volunteer_signup_status" NOT NULL DEFAULT 'active',
  "notes" text,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now(),
  "removed_at" timestamp with time zone,
  "removed_by" uuid REFERENCES "users"("id")
);

-- Indexes for common queries
CREATE INDEX "volunteer_signups_school_idx" ON "volunteer_signups" ("school_id");
CREATE INDEX "volunteer_signups_classroom_idx" ON "volunteer_signups" ("classroom_id");
CREATE INDEX "volunteer_signups_email_idx" ON "volunteer_signups" ("email");
CREATE INDEX "volunteer_signups_status_idx" ON "volunteer_signups" ("status");

-- Unique constraint: one signup per email per classroom per role (when active)
CREATE UNIQUE INDEX "volunteer_signups_unique_active" ON "volunteer_signups" ("classroom_id", "email", "role") WHERE status = 'active';

-- 4. Add access_level to classroom_messages for private room parent boards
ALTER TABLE "classroom_messages" ADD COLUMN "access_level" "message_access_level" NOT NULL DEFAULT 'public';
CREATE INDEX "classroom_messages_access_level_idx" ON "classroom_messages" ("classroom_id", "access_level");
