import { users, volunteerHours } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

/**
 * What the approval queue is a list of.
 *
 * `volunteer_hours.approved` is a *nullable* boolean, so `= false` and "not
 * approved" are not the same set. Every surface that lists, counts or approves
 * pending hours goes through this one predicate — a row the queue shows and the
 * "Approve all" button skips is the kind of disagreement nobody notices until a
 * parent asks why their hours are still pending.
 *
 * It lives here rather than in `actions/volunteer-hours.ts` because that file
 * is `"use server"`, where only async functions may be exported.
 */
export function pendingHoursFilter(schoolId: string) {
  return and(
    eq(volunteerHours.schoolId, schoolId),
    sql`${volunteerHours.approved} is not true`
  );
}

/**
 * Who an hours row belongs to, for a query that has LEFT JOINed `users`.
 *
 * Since the board can transcribe the paper sheet from the monthly meeting, a
 * row's volunteer is either an account or a name someone wrote down. Every read
 * therefore joins `users` on the *left* — an inner join silently drops the
 * unclaimed rows, which is the whole failure mode this shape has to avoid — and
 * resolves the person through these three expressions rather than reading
 * `users.name` directly.
 *
 * The account always wins where there is one: a parent who has since signed in
 * and set their name should not still be reported as the abbreviation the
 * secretary jotted at the meeting.
 */
export const volunteerDisplayName = sql<string>`coalesce(
  nullif(${users.name}, ''),
  nullif(${volunteerHours.volunteerName}, ''),
  ${users.email},
  ${volunteerHours.volunteerEmail}
)`;

/** Null is a real answer — a name on a sheet with no address beside it. */
export const volunteerDisplayEmail = sql<
  string | null
>`coalesce(${users.email}, nullif(${volunteerHours.volunteerEmail}, ''))`;

/**
 * A stable key to group and count a volunteer by, account or not.
 *
 * Two unclaimed rows collapse into one person when they carry the same email,
 * or — failing that — the same name, case-insensitively. Names are a weaker
 * identity than an account and the secretary entering the same "Jane Alvarez"
 * at two meetings means one volunteer, not two; that is the right trade here,
 * and the only alternative (a row per entry) makes every count wrong.
 */
export const volunteerIdentityKey = sql<string>`coalesce(
  ${volunteerHours.userId}::text,
  'guest:' || lower(coalesce(
    nullif(${volunteerHours.volunteerEmail}, ''),
    ${volunteerHours.volunteerName}
  ))
)`;
