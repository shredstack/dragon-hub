import { db } from "@/lib/db";
import {
  committeeSignups,
  schoolMemberships,
  volunteerSignups,
} from "@/lib/db/schema";
import { and, eq, exists, inArray, or, sql } from "drizzle-orm";
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
 */
export function ptaSourcedMemberFilter() {
  return or(
    inArray(schoolMemberships.source, [...PTA_MEMBER_SOURCES]),
    exists(
      db
        .select({ one: sql`1` })
        .from(volunteerSignups)
        .where(
          and(
            eq(volunteerSignups.userId, schoolMemberships.userId),
            eq(volunteerSignups.schoolId, schoolMemberships.schoolId)
          )
        )
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(committeeSignups)
        .where(
          and(
            eq(committeeSignups.userId, schoolMemberships.userId),
            eq(committeeSignups.schoolId, schoolMemberships.schoolId)
          )
        )
    )
  );
}
