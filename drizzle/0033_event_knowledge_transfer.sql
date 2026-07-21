-- Year-over-year event knowledge transfer.
--
-- The event catalog and event plans were two disconnected features. The catalog
-- was a reference doc; plans were per-school-year islands. Nothing carried the
-- useful stuff — which vendor, which contact, what went wrong — from one year's
-- Field Day to the next. This wires them together:
--
--   event_catalog        one row per RECURRING event ("Field Day", forever)
--   event_plans          one row per YEAR of that event ("Field Day 2026-2027")
--   school_contacts      the school's directory of vendors and people
--   event_contact_links  which contacts matter for which event
--   event_plan_wrap_ups  what we learned, folded back into the catalog
--
-- The catalog's identity key was event_type, which was simultaneously being
-- asked to serve as a category. That let two "Field Day" rows coexist under
-- different type strings while two unrelated fundraisers collided. Identity now
-- lives in a slug derived from the title; category is its own column.

-- 1. Catalog: split identity (slug) from category, and make timing sortable.
ALTER TABLE "event_catalog" ADD COLUMN IF NOT EXISTS "slug" text;
--> statement-breakpoint
ALTER TABLE "event_catalog" ADD COLUMN IF NOT EXISTS "category" text;
--> statement-breakpoint
ALTER TABLE "event_catalog" ADD COLUMN IF NOT EXISTS "typical_month" integer;
--> statement-breakpoint
ALTER TABLE "event_catalog" ADD COLUMN IF NOT EXISTS "timing_note" text;
--> statement-breakpoint
ALTER TABLE "event_catalog" ADD COLUMN IF NOT EXISTS "tags" text[];
--> statement-breakpoint
ALTER TABLE "event_catalog" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint

-- 2. Backfill slug from the title, matching lib/utils.ts slugify(): lowercase,
--    strip anything not a-z0-9/space/hyphen, spaces to hyphens, trim hyphens.
UPDATE "event_catalog"
SET "slug" = LEFT(
  TRIM(BOTH '-' FROM REGEXP_REPLACE(
    REGEXP_REPLACE(LOWER("title"), '[^a-z0-9[:space:]-]', '', 'g'),
    '[[:space:]]+', '-', 'g'
  )), 100)
WHERE "slug" IS NULL;
--> statement-breakpoint

-- 3. A title that slugs to nothing (e.g. only punctuation) still needs a key.
UPDATE "event_catalog"
SET "slug" = 'event-' || LEFT("id"::text, 8)
WHERE "slug" IS NULL OR "slug" = '';
--> statement-breakpoint

-- 4. De-duplicate slugs before the unique index goes on. Oldest row keeps the
--    bare slug; later ones get -2, -3, ... Boards can merge them by hand after.
UPDATE "event_catalog" AS ec
SET "slug" = ec."slug" || '-' || ranked.rn
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "school_id", "slug" ORDER BY "created_at", "id"
         ) AS rn
  FROM "event_catalog"
) AS ranked
WHERE ec."id" = ranked."id" AND ranked.rn > 1;
--> statement-breakpoint

ALTER TABLE "event_catalog" ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint

-- 5. Carry the old event_type across when it happens to name a real category,
--    so existing entries don't come back blank.
UPDATE "event_catalog"
SET "category" = CASE LOWER(TRIM("event_type"))
  WHEN 'fundraiser' THEN 'fundraiser'
  WHEN 'party' THEN 'party'
  WHEN 'assembly' THEN 'assembly'
  WHEN 'athletic' THEN 'athletic'
  WHEN 'social' THEN 'social'
  WHEN 'meeting' THEN 'meeting'
  WHEN 'service' THEN 'service'
  WHEN 'performance' THEN 'performance'
  ELSE 'other'
END
WHERE "category" IS NULL AND "event_type" IS NOT NULL;
--> statement-breakpoint

-- 6. Pull a month out of the old free-text timing ("October", "Late October",
--    "Spring semester" -> no month, text survives in timing_note).
UPDATE "event_catalog"
SET "typical_month" = CASE
  WHEN "typical_timing" ILIKE '%jan%' THEN 1
  WHEN "typical_timing" ILIKE '%feb%' THEN 2
  WHEN "typical_timing" ILIKE '%mar%' THEN 3
  WHEN "typical_timing" ILIKE '%apr%' THEN 4
  WHEN "typical_timing" ILIKE '%may%' THEN 5
  WHEN "typical_timing" ILIKE '%jun%' THEN 6
  WHEN "typical_timing" ILIKE '%jul%' THEN 7
  WHEN "typical_timing" ILIKE '%aug%' THEN 8
  WHEN "typical_timing" ILIKE '%sep%' THEN 9
  WHEN "typical_timing" ILIKE '%oct%' THEN 10
  WHEN "typical_timing" ILIKE '%nov%' THEN 11
  WHEN "typical_timing" ILIKE '%dec%' THEN 12
  ELSE NULL
END
WHERE "typical_month" IS NULL AND "typical_timing" IS NOT NULL;
--> statement-breakpoint

-- 7. Keep whatever the month parse couldn't capture as the human nuance note.
UPDATE "event_catalog"
SET "timing_note" = "typical_timing"
WHERE "timing_note" IS NULL
  AND "typical_timing" IS NOT NULL
  AND ("typical_month" IS NULL OR LENGTH(TRIM("typical_timing")) > 12);
--> statement-breakpoint

-- 8. Swap the identity constraint. event_type stays as a nullable column for
--    one release so anything still reading it keeps working.
DROP INDEX IF EXISTS "event_catalog_unique";
--> statement-breakpoint
ALTER TABLE "event_catalog" ALTER COLUMN "event_type" DROP NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_catalog_slug_unique" ON "event_catalog" ("school_id","slug");
--> statement-breakpoint

-- 9. Event plans point at the recurring event they're an instance of.
ALTER TABLE "event_plans" ADD COLUMN IF NOT EXISTS "event_catalog_id" uuid;
--> statement-breakpoint
ALTER TABLE "event_plans" ADD COLUMN IF NOT EXISTS "is_one_off" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "event_plans" ADD COLUMN IF NOT EXISTS "tags" text[];
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "event_plans" ADD CONSTRAINT "event_plans_event_catalog_id_event_catalog_id_fk"
    FOREIGN KEY ("event_catalog_id") REFERENCES "public"."event_catalog"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "event_plans_catalog_idx" ON "event_plans" ("event_catalog_id");
--> statement-breakpoint

-- 10. Backfill the link where a plan's title clearly names a catalog entry.
--     Exact slug match only — a fuzzy guess here would silently file last
--     year's Fun Run under the wrong recurring event, and nobody would look.
UPDATE "event_plans" AS ep
SET "event_catalog_id" = ec."id"
FROM "event_catalog" AS ec
WHERE ep."event_catalog_id" IS NULL
  AND ep."school_id" = ec."school_id"
  AND ec."slug" = LEFT(
    TRIM(BOTH '-' FROM REGEXP_REPLACE(
      REGEXP_REPLACE(LOWER(ep."title"), '[^a-z0-9[:space:]-]', '', 'g'),
      '[[:space:]]+', '-', 'g'
    )), 100);
--> statement-breakpoint

-- 11. Also adopt the catalog entries that were generated FROM a plan — those
--     already record their provenance, so the link is certain.
UPDATE "event_plans" AS ep
SET "event_catalog_id" = ec."id"
FROM "event_catalog" AS ec
WHERE ep."event_catalog_id" IS NULL
  AND ep."school_id" = ec."school_id"
  AND ep."id" = ANY(ec."source_event_plan_ids");
--> statement-breakpoint

-- 12. The school's contact directory. School-scoped, not event-scoped: the
--     bounce house vendor serves Field Day AND Back to School Night, and their
--     phone number should only ever be wrong in one place.
CREATE TABLE IF NOT EXISTS "school_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "name" text NOT NULL,
  "organization" text,
  "category" text,
  "phone" text,
  "email" text,
  "website" text,
  "address" text,
  "notes" text,
  "tags" text[],
  "last_used_year" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "school_contacts" ADD CONSTRAINT "school_contacts_school_id_schools_id_fk"
    FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "school_contacts" ADD CONSTRAINT "school_contacts_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "school_contacts_school_idx" ON "school_contacts" ("school_id");
--> statement-breakpoint

-- 13. Contact <-> event join. A link hangs off EITHER a catalog entry
--     (evergreen, inherited by every future year) OR a single year's plan.
CREATE TABLE IF NOT EXISTS "event_contact_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contact_id" uuid NOT NULL,
  "event_catalog_id" uuid,
  "event_plan_id" uuid,
  "used_for" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "event_contact_links_one_target" CHECK (
    ("event_catalog_id" IS NOT NULL AND "event_plan_id" IS NULL) OR
    ("event_catalog_id" IS NULL AND "event_plan_id" IS NOT NULL)
  )
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "event_contact_links" ADD CONSTRAINT "event_contact_links_contact_id_school_contacts_id_fk"
    FOREIGN KEY ("contact_id") REFERENCES "public"."school_contacts"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "event_contact_links" ADD CONSTRAINT "event_contact_links_event_catalog_id_event_catalog_id_fk"
    FOREIGN KEY ("event_catalog_id") REFERENCES "public"."event_catalog"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "event_contact_links" ADD CONSTRAINT "event_contact_links_event_plan_id_event_plans_id_fk"
    FOREIGN KEY ("event_plan_id") REFERENCES "public"."event_plans"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "event_contact_links" ADD CONSTRAINT "event_contact_links_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "event_contact_links_catalog_idx" ON "event_contact_links" ("event_catalog_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_contact_links_plan_idx" ON "event_contact_links" ("event_plan_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_contact_links_contact_idx" ON "event_contact_links" ("contact_id");
--> statement-breakpoint

-- Same contact can't be attached to the same event twice. Two partial uniques
-- because a NULL target column would otherwise never collide.
CREATE UNIQUE INDEX IF NOT EXISTS "event_contact_links_catalog_unique"
  ON "event_contact_links" ("contact_id","event_catalog_id")
  WHERE "event_catalog_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_contact_links_plan_unique"
  ON "event_contact_links" ("contact_id","event_plan_id")
  WHERE "event_plan_id" IS NOT NULL;
--> statement-breakpoint

-- 14. Post-event retrospective, one per plan.
CREATE TABLE IF NOT EXISTS "event_plan_wrap_ups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_plan_id" uuid NOT NULL,
  "what_worked" text,
  "what_to_change" text,
  "actual_cost" text,
  "actual_volunteers" text,
  "applied_to_catalog" boolean DEFAULT false NOT NULL,
  "submitted_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "event_plan_wrap_ups" ADD CONSTRAINT "event_plan_wrap_ups_event_plan_id_event_plans_id_fk"
    FOREIGN KEY ("event_plan_id") REFERENCES "public"."event_plans"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "event_plan_wrap_ups" ADD CONSTRAINT "event_plan_wrap_ups_submitted_by_users_id_fk"
    FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "event_plan_wrap_ups_plan_unique" ON "event_plan_wrap_ups" ("event_plan_id");
