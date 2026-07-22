-- Schools that don't run their budget or fundraisers through DragonHub can
-- hide those areas from general members (PTA board and school admins keep
-- access) so nobody trusts a page nobody keeps current.
-- NULL means "everything visible", which is the right default for every
-- existing school — no backfill needed.

ALTER TABLE "schools" ADD COLUMN "module_visibility" jsonb;
