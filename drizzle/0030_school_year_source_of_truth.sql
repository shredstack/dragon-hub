-- Make schools.current_school_year the single source of truth for a school's
-- active year.
--
-- Previously this column was nullable and most code read the hardcoded
-- CURRENT_SCHOOL_YEAR constant instead. Once an admin changed the column the two
-- disagreed, every year-scoped membership lookup silently returned nothing, and
-- the school locked itself out. Backfilling and enforcing NOT NULL removes the
-- "which year is it?" ambiguity at the schema level.

-- 1. Backfill from the most recent school year that actually has memberships,
--    falling back to the historical constant for schools with no members yet.
UPDATE schools s
SET current_school_year = COALESCE(
  (
    SELECT m.school_year
    FROM school_memberships m
    WHERE m.school_id = s.id
    ORDER BY m.school_year DESC
    LIMIT 1
  ),
  '2025-2026'
)
WHERE s.current_school_year IS NULL;

--> statement-breakpoint

-- 2. Ensure every school offers its own active year in the picker.
UPDATE schools
SET available_school_years = ARRAY[current_school_year]
WHERE available_school_years IS NULL
   OR cardinality(available_school_years) = 0;

--> statement-breakpoint

UPDATE schools
SET available_school_years =
  array_prepend(current_school_year, available_school_years)
WHERE NOT (current_school_year = ANY(available_school_years));

--> statement-breakpoint

-- 3. Lock it in. The DEFAULT matters as much as the NOT NULL: the column was
--    added without one (0023), so an INSERT that omits it emits `DEFAULT` ->
--    NULL and would now fail the constraint.
ALTER TABLE schools ALTER COLUMN current_school_year SET DEFAULT '2025-2026';

--> statement-breakpoint

ALTER TABLE schools ALTER COLUMN current_school_year SET NOT NULL;

--> statement-breakpoint

-- 4. Membership lookups are always (school_id, school_year, status) filtered.
CREATE INDEX IF NOT EXISTS school_memberships_school_year_status_idx
  ON school_memberships (school_id, school_year, status);

--> statement-breakpoint

-- 5. Leadership lookups deliberately span all years (the anti-lockout valve),
--    so they need their own index on (school_id, user_id, status).
CREATE INDEX IF NOT EXISTS school_memberships_school_user_status_idx
  ON school_memberships (school_id, user_id, status);
