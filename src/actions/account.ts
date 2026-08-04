"use server";

import { db } from "@/lib/db";
import {
  classroomMessages,
  committeeMessages,
  committeeSignups,
  eventPlanMessages,
  schoolMemberships,
  users,
  volunteerHours,
  volunteerSignups,
} from "@/lib/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { assertAuthenticated } from "@/lib/auth-helpers";
import {
  deleteUserAndReleaseSeats,
  findLastBoardMembership,
  type LastBoardMemberBlock,
} from "@/lib/account-deletion";

/**
 * Deleting your own account.
 *
 * Both stores require this to exist and to be reachable from inside the app —
 * Apple Guideline 5.1.1(v) and Google Play's account-deletion policy — and
 * "email the PTA board and ask" does not satisfy either.
 *
 * Deliberately NOT a reuse of `deleteUser` in src/actions/admin.ts. That one is
 * school-admin gated, refuses self-deletion, and requires a current-year
 * membership at the admin's own school; every one of those guards is wrong
 * here, and the inverse guards below would be wrong there. They share the tail
 * (`src/lib/account-deletion.ts`) and nothing else.
 */

export interface AccountDeletionPreview {
  /** Non-null means deletion is refused, with a reason to show. */
  blocked: LastBoardMemberBlock | null;
  email: string;
  schools: string[];
  volunteerSeats: number;
  committeeSeats: number;
  messageCount: number;
  volunteerHours: number;
}

/**
 * What deleting would actually destroy.
 *
 * Shown before the confirmation rather than after, because "your account will
 * be deleted" is not informed consent when the account is also two room parent
 * seats and 40 logged hours.
 */
export async function getAccountDeletionPreview(): Promise<AccountDeletionPreview> {
  const user = await assertAuthenticated();
  const userId = user.id!;

  const [
    blocked,
    profile,
    memberships,
    volunteerSeats,
    committeeSeats,
    messages,
    hours,
  ] = await Promise.all([
    findLastBoardMembership(userId),
    db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { email: true },
    }),
    db.query.schoolMemberships.findMany({
      where: and(
        eq(schoolMemberships.userId, userId),
        eq(schoolMemberships.status, "approved")
      ),
      with: { school: { columns: { name: true } } },
    }),
    countRows(volunteerSignups, userId, ne(volunteerSignups.status, "removed")),
    countRows(committeeSignups, userId, ne(committeeSignups.status, "removed")),
    countMessages(userId),
    db
      .select({ total: sql<string>`coalesce(sum(${volunteerHours.hours}), 0)` })
      .from(volunteerHours)
      .where(eq(volunteerHours.userId, userId)),
  ]);

  return {
    blocked,
    email: profile?.email ?? user.email ?? "",
    schools: [
      ...new Set(memberships.map((m) => m.school?.name).filter(Boolean)),
    ] as string[],
    volunteerSeats,
    committeeSeats,
    messageCount: messages,
    volunteerHours: Number(hours[0]?.total ?? 0),
  };
}

/**
 * Delete the caller's own account.
 *
 * `confirmation` must be the user's own email address, compared
 * case-insensitively — not a checkbox. This is irreversible and takes their
 * volunteer history with it; the friction is the feature.
 */
export async function deleteMyAccount(confirmation: string): Promise<void> {
  const user = await assertAuthenticated();
  const userId = user.id!;

  const profile = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { email: true },
  });
  const email = profile?.email?.trim().toLowerCase();
  if (!email) throw new Error("Account not found");

  if (confirmation.trim().toLowerCase() !== email) {
    throw new Error(
      "Type your email address exactly as it appears above to confirm."
    );
  }

  // Re-checked at delete time, not just in the preview: the preview may be
  // minutes old, and the other board member may have left in between.
  const blocked = await findLastBoardMembership(userId);
  if (blocked) {
    throw new Error(
      `You're the only PTA board member at ${blocked.schoolName}. Make someone else a board member first, or the school will have nobody who can administer it.`
    );
  }

  // Releases every seat this person holds — promoting and emailing whoever is
  // next in line — then deletes the row. See `account-deletion.ts` for why the
  // order matters.
  await deleteUserAndReleaseSeats({ userId, actorId: userId });
}

async function countMessages(userId: string): Promise<number> {
  const [classroom, committee, eventPlan] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(classroomMessages)
      .where(eq(classroomMessages.authorId, userId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(committeeMessages)
      .where(eq(committeeMessages.authorId, userId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(eventPlanMessages)
      .where(eq(eventPlanMessages.authorId, userId)),
  ]);
  return (
    (classroom[0]?.n ?? 0) + (committee[0]?.n ?? 0) + (eventPlan[0]?.n ?? 0)
  );
}

async function countRows(
  table: typeof volunteerSignups | typeof committeeSignups,
  userId: string,
  extra: ReturnType<typeof ne>
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(and(eq(table.userId, userId), extra));
  return row?.n ?? 0;
}
