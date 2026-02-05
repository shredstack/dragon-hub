-- Migration: Enforce school_id NOT NULL constraints
-- Run this AFTER running the migrate-to-multi-school.ts script
-- This migration makes school_id columns non-nullable

-- First verify all records have school_id set
DO $$
BEGIN
  -- Check classrooms
  IF EXISTS (SELECT 1 FROM classrooms WHERE school_id IS NULL) THEN
    RAISE EXCEPTION 'classrooms table has NULL school_id values. Run migrate-to-multi-school.ts first.';
  END IF;

  -- Check volunteer_hours
  IF EXISTS (SELECT 1 FROM volunteer_hours WHERE school_id IS NULL) THEN
    RAISE EXCEPTION 'volunteer_hours table has NULL school_id values. Run migrate-to-multi-school.ts first.';
  END IF;

  -- Check calendar_events
  IF EXISTS (SELECT 1 FROM calendar_events WHERE school_id IS NULL) THEN
    RAISE EXCEPTION 'calendar_events table has NULL school_id values. Run migrate-to-multi-school.ts first.';
  END IF;

  -- Check budget_categories
  IF EXISTS (SELECT 1 FROM budget_categories WHERE school_id IS NULL) THEN
    RAISE EXCEPTION 'budget_categories table has NULL school_id values. Run migrate-to-multi-school.ts first.';
  END IF;

  -- Check budget_transactions
  IF EXISTS (SELECT 1 FROM budget_transactions WHERE school_id IS NULL) THEN
    RAISE EXCEPTION 'budget_transactions table has NULL school_id values. Run migrate-to-multi-school.ts first.';
  END IF;

  -- Check fundraisers
  IF EXISTS (SELECT 1 FROM fundraisers WHERE school_id IS NULL) THEN
    RAISE EXCEPTION 'fundraisers table has NULL school_id values. Run migrate-to-multi-school.ts first.';
  END IF;

  -- Check knowledge_articles
  IF EXISTS (SELECT 1 FROM knowledge_articles WHERE school_id IS NULL) THEN
    RAISE EXCEPTION 'knowledge_articles table has NULL school_id values. Run migrate-to-multi-school.ts first.';
  END IF;

  -- Check event_plans
  IF EXISTS (SELECT 1 FROM event_plans WHERE school_id IS NULL) THEN
    RAISE EXCEPTION 'event_plans table has NULL school_id values. Run migrate-to-multi-school.ts first.';
  END IF;
END $$;

-- Now apply NOT NULL constraints
ALTER TABLE classrooms ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE volunteer_hours ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE calendar_events ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE budget_categories ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE budget_transactions ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE fundraisers ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE knowledge_articles ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE event_plans ALTER COLUMN school_id SET NOT NULL;

-- Add indexes for better query performance on school_id columns
CREATE INDEX IF NOT EXISTS idx_classrooms_school_id ON classrooms(school_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_hours_school_id ON volunteer_hours(school_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_school_id ON calendar_events(school_id);
CREATE INDEX IF NOT EXISTS idx_budget_categories_school_id ON budget_categories(school_id);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_school_id ON budget_transactions(school_id);
CREATE INDEX IF NOT EXISTS idx_fundraisers_school_id ON fundraisers(school_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_school_id ON knowledge_articles(school_id);
CREATE INDEX IF NOT EXISTS idx_event_plans_school_id ON event_plans(school_id);
