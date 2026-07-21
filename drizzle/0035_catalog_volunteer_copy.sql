-- Volunteer-facing copy on the recurring event catalog.
--
-- Volunteer campaigns let a board member write "what volunteers typically do",
-- a time commitment, and pick an emoji per campaign event. But those are facts
-- about the EVENT, not about one year's recruiting push — what you'd actually
-- be doing at Field Day is the same answer every spring. Re-typing them for
-- every campaign is how they end up inconsistent.
--
-- Moving them onto event_catalog makes the catalog the single source campaigns
-- pull from. Campaign events keep their own copies (a campaign snapshot stays
-- editable without mutating the catalog) — this just gives the copy somewhere
-- to come from.

ALTER TABLE "event_catalog" ADD COLUMN IF NOT EXISTS "volunteer_responsibilities" text;
--> statement-breakpoint
ALTER TABLE "event_catalog" ADD COLUMN IF NOT EXISTS "time_commitment" text;
--> statement-breakpoint
ALTER TABLE "event_catalog" ADD COLUMN IF NOT EXISTS "icon_emoji" text;
--> statement-breakpoint
ALTER TABLE "event_catalog" ADD COLUMN IF NOT EXISTS "image_url" text;
--> statement-breakpoint

-- Backfill from campaign events that already came from a catalog entry, so the
-- copy boards have already written isn't thrown away. Where several campaigns
-- described the same event, the most recently updated one wins.
UPDATE "event_catalog" AS ec
SET
  "volunteer_responsibilities" = COALESCE(ec."volunteer_responsibilities", src."volunteer_responsibilities"),
  "time_commitment"            = COALESCE(ec."time_commitment",            src."time_commitment"),
  "icon_emoji"                 = COALESCE(ec."icon_emoji",                 src."icon_emoji"),
  "image_url"                  = COALESCE(ec."image_url",                  src."image_url")
FROM (
  SELECT DISTINCT ON ("event_catalog_id")
    "event_catalog_id",
    "volunteer_responsibilities",
    "time_commitment",
    "icon_emoji",
    "image_url"
  FROM "volunteer_campaign_events"
  WHERE "event_catalog_id" IS NOT NULL
  ORDER BY "event_catalog_id", "updated_at" DESC NULLS LAST
) AS src
WHERE ec."id" = src."event_catalog_id";
