import "server-only";
import { db } from "@/lib/db";
import { schoolMemberships, users } from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { releaseSignupSeatsForUser, type ReleasedSeats } from "@/lib/signup-seats";
import { anonymizeReimbursementRecords } from "@/lib/reimbursement-records";
import { getSchoolCurrentYear } from "@/lib/school-year";

/**
 * The shared tail of every account deletion: give back the seats, then delete
 * the row.
 *
 * There are three callers and their **authorization differs and must keep
 * differing** — that is exactly why only the tail is shared:
 *
 *  - `deleteUser` (src/actions/admin.ts) — school-admin gated, refuses
 *    self-deletion, requires a current-year membership at the admin's school.
 *  - `deleteMyAccount` (src/actions/account.ts) — the opposite: only ever your
 *    own account, requires typing your email, and blocks if you are the last
 *    board member anywhere.
 * Folding those into one function with a mode flag is how a guard ends up
 * skipped by the wrong caller.
 *
 * The Private Relay merge (src/lib/account-merge.ts) deliberately does *not*
 * use this: it needs the deletion of the relay account and the move of its
 * Apple identity to be one transaction, so it calls
 * `releaseSignupSeatsForUser` itself and deletes inside that transaction. Keep
 * the two in step if the tail below grows.
 */

/**
 * Release seats, anonymize the financial record, then delete the user.
 *
 * The order is the whole point, and it is the CLAUDE.md rule about signup rows:
 * `volunteer_signups.user_id` and `committee_signups.user_id` are ON DELETE SET
 * NULL, so deleting the account **leaves the row behind, still `active`**,
 * still counting against a room parent limit, under whatever name the parent
 * typed into the form — with the waitlist behind it frozen forever.
 *
 * `releaseSignupSeatsForUser` runs first and outside any transaction, because
 * it opens transactions of its own: each deactivation ends in a promotion sweep
 * that takes a row lock and emails whoever moves up. Nesting it would deadlock.
 */
export async function deleteUserAndReleaseSeats(params: {
  userId: string;
  /** Recorded as `removed_by`, and credited as the promoter of anyone moved up. */
  actorId: string;
}): Promise<ReleasedSeats> {
  const released = await releaseSignupSeatsForUser({
    userId: params.userId,
    removedBy: params.actorId,
  });

  // The one exception to the sentence below. Reimbursement requests, receipts
  // and approvals point at `users` with ON DELETE RESTRICT, because who was
  // paid and who signed for it is a financial record with a ten-year retention
  // expectation — cascade would destroy it and set-null would misstate it. So
  // the history is moved onto a shared placeholder account first, which both
  // removes the person and leaves the record standing. See
  // `src/lib/reimbursement-records.ts`.
  await anonymizeReimbursementRecords(params.userId);

  // Every remaining reference to `users` is cascade or set-null (see the
  // comment above the table in schema.ts), so this one statement resolves the
  // whole graph. Hand-nullifying columns here is what the admin path used to
  // do, and it silently fell behind every table added since.
  await db.delete(users).where(eq(users.id, params.userId));

  return released;
}

export interface LastBoardMemberBlock {
  reason: "last_board_member";
  schoolName: string;
}

/**
 * Is this person the only PTA board member left at some school?
 *
 * A school with no board is unadministrable: nobody can approve hours, publish
 * an article, approve a pending member, or hand the role to anyone else. The
 * way out is one instruction ("make someone else a board member first"), which
 * is why this blocks with the school named rather than warning.
 *
 * Only applies to self-deletion. The admin path already requires *another*
 * administrator to be doing the deleting.
 */
export async function findLastBoardMembership(
  userId: string
): Promise<LastBoardMemberBlock | null> {
  const memberships = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.userId, userId),
      eq(schoolMemberships.role, "pta_board"),
      eq(schoolMemberships.status, "approved")
    ),
    with: { school: { columns: { id: true, name: true } } },
  });

  for (const membership of memberships) {
    if (!membership.school) continue;
    // Only the school's *current* year matters — being the last board member
    // of 2019-2020 blocks nothing.
    const year = await getSchoolCurrentYear(membership.school.id);
    if (membership.schoolYear !== year) continue;

    const others = await db.query.schoolMemberships.findFirst({
      where: and(
        eq(schoolMemberships.schoolId, membership.school.id),
        eq(schoolMemberships.schoolYear, year),
        eq(schoolMemberships.role, "pta_board"),
        eq(schoolMemberships.status, "approved"),
        ne(schoolMemberships.userId, userId)
      ),
      columns: { id: true },
    });

    if (!others) {
      return { reason: "last_board_member", schoolName: membership.school.name };
    }
  }

  return null;
}
