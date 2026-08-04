-- Hand-authored: Drizzle cannot express a partial unique index.
--
-- Collapsing is what stops a committee board with eleven posts overnight from
-- becoming eleven inbox rows and eleven pushes. `notify()` does it with a
-- single `INSERT ... ON CONFLICT (user_id, group_key) WHERE read_at IS NULL
-- DO UPDATE`, which needs a matching *partial unique* index to arbitrate on —
-- without one Postgres rejects the ON CONFLICT clause outright, so this index
-- is not an optimization, it is the mechanism.
--
-- The `WHERE read_at IS NULL` half is the interesting part: uniqueness only
-- applies to *unread* rows. Once someone has read "3 new messages in Yearbook",
-- the next post must start a fresh row rather than silently rewriting the one
-- they already saw and marked read.

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_user_group_unread_unique"
  ON "notifications" ("user_id", "group_key")
  WHERE "read_at" IS NULL AND "group_key" IS NOT NULL;
