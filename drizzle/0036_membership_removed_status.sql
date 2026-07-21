-- Separate "taken off the roster" from "access blocked".
--
-- The member directory's only removal control used to delete the user row
-- outright — platform-wide, not school-scoped, taking their volunteer hours and
-- every other school's membership with it. The soft alternative that already
-- existed set status to 'revoked', which joinSchool explicitly refuses to let
-- back in, so the gentle-sounding option was the one that permanently locked
-- someone out.
--
-- 'removed' is the middle ground the board actually wants: off the roster, no
-- access, data intact, and free to rejoin with the school code or by signing up
-- for a room parent / volunteer slot. 'revoked' keeps its harder meaning for
-- the cases where re-entry should not be self-service.
--
-- Written by hand because drizzle-kit generate can't run non-interactively on
-- this branch's pending diffs; ALTER TYPE ... ADD VALUE is transaction-safe on
-- PG 12+ as long as the new value isn't used in the same transaction.

ALTER TYPE "school_membership_status" ADD VALUE IF NOT EXISTS 'removed';
