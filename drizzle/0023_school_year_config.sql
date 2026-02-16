-- Add school-level school year configuration
-- Allows each school to configure their own current school year and available years

ALTER TABLE "schools"
  ADD COLUMN "current_school_year" text,
  ADD COLUMN "available_school_years" text[];

-- Add comment for clarity
COMMENT ON COLUMN "schools"."current_school_year" IS 'The active school year for this school (e.g., 2025-2026)';
COMMENT ON COLUMN "schools"."available_school_years" IS 'Array of school years available in dropdowns for this school';
