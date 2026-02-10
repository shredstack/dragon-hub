-- AI Discussion Messages Migration
-- Adds support for @dragonhub AI assistant in event plan discussions

ALTER TABLE "event_plan_messages" ADD COLUMN "is_ai_response" boolean DEFAULT false;
ALTER TABLE "event_plan_messages" ADD COLUMN "ai_sources" text;
