-- Category columns stored display labels; they now store slugs.
--
-- Written by hand because this is data, not schema: drizzle-kit generate has
-- nothing to diff. Each UPDATE lists only the labels that were ever offered
-- (plus the ones the AI extractors invented), and touches nothing else — an
-- unrecognized value is left alone and still renders, because categoryLabel()
-- falls back to the raw string.
--
-- Slugs are immutable from here. Renaming a category means editing its label in
-- src/lib/constants.ts, which is the whole point of the change.

UPDATE "knowledge_articles" SET "category" = CASE "category"
  WHEN 'Events' THEN 'events'
  WHEN 'Fundraising' THEN 'fundraising'
  WHEN 'Classroom Activities' THEN 'classroom_activities'
  WHEN 'Policies' THEN 'policies'
  WHEN 'Procedures' THEN 'procedures'
  WHEN 'Budget' THEN 'budget'
  WHEN 'Budgets' THEN 'budget'
  WHEN 'Volunteers' THEN 'volunteers'
  WHEN 'Communications' THEN 'communications'
  WHEN 'Onboarding' THEN 'onboarding'
  WHEN 'Other' THEN 'other'
  ELSE "category"
END
WHERE "category" IN (
  'Events', 'Fundraising', 'Classroom Activities', 'Policies', 'Procedures',
  'Budget', 'Budgets', 'Volunteers', 'Communications', 'Onboarding', 'Other'
);
--> statement-breakpoint

-- 'Events' and 'General' are not from the picker — they are seed-data values
-- that predate anyone checking. Mapped to the nearest real bucket.
UPDATE "volunteer_hours" SET "category" = CASE "category"
  WHEN 'Classroom Support' THEN 'classroom_support'
  WHEN 'Event Help' THEN 'event_help'
  WHEN 'Events' THEN 'event_help'
  WHEN 'Fundraising' THEN 'fundraising'
  WHEN 'Field Trip' THEN 'field_trip'
  WHEN 'Library' THEN 'library'
  WHEN 'Office Help' THEN 'office_help'
  WHEN 'PTA Business' THEN 'pta_business'
  WHEN 'General' THEN 'other'
  WHEN 'Other' THEN 'other'
  ELSE "category"
END
WHERE "category" IN (
  'Classroom Support', 'Event Help', 'Events', 'Fundraising', 'Field Trip',
  'Library', 'Office Help', 'PTA Business', 'General', 'Other'
);
--> statement-breakpoint

UPDATE "onboarding_resources" SET "category" = CASE "category"
  WHEN 'PTA Board Role Specific Trainings' THEN 'role_trainings'
  WHEN 'Handbooks' THEN 'handbooks'
  WHEN 'Tools' THEN 'tools'
  WHEN 'General Trainings' THEN 'general_trainings'
  WHEN 'Contact Info' THEN 'contact_info'
  ELSE "category"
END
WHERE "category" IN (
  'PTA Board Role Specific Trainings', 'Handbooks', 'Tools',
  'General Trainings', 'Contact Info'
);
--> statement-breakpoint

UPDATE "state_onboarding_resources" SET "category" = CASE "category"
  WHEN 'PTA Board Role Specific Trainings' THEN 'role_trainings'
  WHEN 'Handbooks' THEN 'handbooks'
  WHEN 'Tools' THEN 'tools'
  WHEN 'General Trainings' THEN 'general_trainings'
  WHEN 'Contact Info' THEN 'contact_info'
  ELSE "category"
END
WHERE "category" IN (
  'PTA Board Role Specific Trainings', 'Handbooks', 'Tools',
  'General Trainings', 'Contact Info'
);
--> statement-breakpoint

UPDATE "district_onboarding_resources" SET "category" = CASE "category"
  WHEN 'PTA Board Role Specific Trainings' THEN 'role_trainings'
  WHEN 'Handbooks' THEN 'handbooks'
  WHEN 'Tools' THEN 'tools'
  WHEN 'General Trainings' THEN 'general_trainings'
  WHEN 'Contact Info' THEN 'contact_info'
  ELSE "category"
END
WHERE "category" IN (
  'PTA Board Role Specific Trainings', 'Handbooks', 'Tools',
  'General Trainings', 'Contact Info'
);
