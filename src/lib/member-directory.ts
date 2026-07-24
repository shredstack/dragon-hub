import { db } from "@/lib/db";
import {
  committeeSignups,
  schoolMemberships,
  volunteerSignups,
} from "@/lib/db/schema";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { PTA_MEMBER_SOURCES } from "@/types";

/**
 * Who belongs in the PTA's member directory.
 *
 * The rule is provenance, not role: someone is the PTA's to see if they came in
 * through a PTA door. A principal admitted by the school's own staff code is
 * not — he shows up on the School Staff roster instead.
 *
 * The signup half of the union is not redundant with the `source` column, and
 * dropping it would quietly break the case it exists for. `school_memberships`
 * is unique on (school, user, year), so a principal who is already a member and
 * *then* signs up to run the cakewalk keeps his original `source`: the linking
 * code finds an existing membership and skips the insert. The signup rows are
 * the actual evidence that someone took part in something the PTA runs, so the
 * directory asks them directly.
 *
 * Takes `schoolId` so the signup lookups stand on their own instead of
 * correlating against the outer row. A correlated `exists (... where
 * volunteer_signups.user_id = school_memberships.user_id)` reads fine but only
 * survives a plain `db.select()`: the relational query builder aliases the
 * table to `"schoolMemberships"`, the base name goes out of scope, and Postgres
 * rejects the whole query with `invalid reference to FROM-clause entry`. These
 * subqueries name only their own table, so the filter drops into either builder.
 */
export function ptaSourcedMemberFilter(schoolId: string) {
  return or(
    inArray(schoolMemberships.source, [...PTA_MEMBER_SOURCES]),
    inArray(
      schoolMemberships.userId,
      db
        .select({ userId: volunteerSignups.userId })
        .from(volunteerSignups)
        .where(
          and(
            eq(volunteerSignups.schoolId, schoolId),
            // A signup that never verified has no user; leaving the NULLs in
            // the IN-list makes the whole comparison NULL for non-matches.
            isNotNull(volunteerSignups.userId)
          )
        )
    ),
    inArray(
      schoolMemberships.userId,
      db
        .select({ userId: committeeSignups.userId })
        .from(committeeSignups)
        .where(
          and(
            eq(committeeSignups.schoolId, schoolId),
            isNotNull(committeeSignups.userId)
          )
        )
    )
  );
}
