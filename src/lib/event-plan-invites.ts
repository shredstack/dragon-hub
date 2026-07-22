import { db } from "@/lib/db";
import {
  eventPlanInvites,
  eventPlanMembers,
  schoolMemberships,
  users,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";

/**
 * Redeeming an event plan invitation.
 *
 * Kept out of `src/actions/` because it runs from NextAuth events, and modules
 * marked "use server" can't be imported there — the same constraint that put
 * `linkVolunteerSignupsToUser` in its own file.
 */

/** Comparisons and storage both use the lowercased form. */
export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Turn one pending invite into real access.
 *
 * The school membership comes first and is the reason this can't just insert an
 * event member row: an invitee with no membership signs in and is bounced
 * straight to the join-code wall, never reaching the event they were invited
 * to. Membership is granted as a plain `member` for the school's active year —
 * the invite is to an event, not to the board.
 *
 * The invited address must be this user's own — the check lives here rather
 * than in the callers so an invitation can never be redeemed into somebody
 * else's account, however the function is reached later.
 *
 * Safe to call twice; the second call finds the invite already accepted.
 */
export async function acceptEventPlanInvite(
  inviteId: string,
  userId: string
): Promise<{ eventPlanId: string } | null> {
  const invite = await db.query.eventPlanInvites.findFirst({
    where: eq(eventPlanInvites.id, inviteId),
    with: { eventPlan: { columns: { id: true, schoolId: true } } },
  });
  if (!invite || invite.status !== "pending" || !invite.eventPlan) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { email: true },
  });
  if (!user?.email || normalizeInviteEmail(user.email) !== invite.email) {
    console.error(
      `Refusing event plan invite ${inviteId}: addressed to a different account`
    );
    return null;
  }

  // A plan with no school predates multi-school support and has no membership
  // to grant; there's nothing coherent to accept into.
  const schoolId = invite.eventPlan.schoolId;
  if (!schoolId) return null;

  const schoolYear = await getSchoolCurrentYear(schoolId);

  const existingMembership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, userId),
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, schoolYear)
    ),
  });

  if (!existingMembership) {
    await db.insert(schoolMemberships).values({
      userId,
      schoolId,
      role: "member",
      schoolYear,
      status: "approved",
      invitedBy: invite.invitedBy,
      approvedAt: new Date(),
    });
  } else if (existingMembership.status !== "approved") {
    // A revoked membership is a deliberate block and outranks an invite — the
    // event membership below is harmless without school access, and the
    // board can lift the revocation if this was a mistake.
    if (existingMembership.status === "revoked") return null;
    await db
      .update(schoolMemberships)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(schoolMemberships.id, existingMembership.id));
  }

  await db
    .insert(eventPlanMembers)
    .values({
      eventPlanId: invite.eventPlanId,
      userId,
      role: invite.role,
    })
    .onConflictDoNothing();

  await db
    .update(eventPlanInvites)
    .set({ status: "accepted", acceptedAt: new Date(), acceptedBy: userId })
    .where(eq(eventPlanInvites.id, inviteId));

  return { eventPlanId: invite.eventPlanId };
}

/**
 * Redeem every pending invite addressed to this email.
 *
 * Runs on sign-in so an invitee who reaches the app another way — an existing
 * account, a magic link they requested themselves — still ends up inside the
 * event rather than needing to dig the invitation back out of their inbox.
 */
export async function linkEventPlanInvitesToUser(userId: string, email: string) {
  const pending = await db.query.eventPlanInvites.findMany({
    where: and(
      eq(eventPlanInvites.email, normalizeInviteEmail(email)),
      eq(eventPlanInvites.status, "pending")
    ),
    columns: { id: true },
  });

  let linked = 0;
  for (const invite of pending) {
    if (await acceptEventPlanInvite(invite.id, userId)) linked++;
  }
  return { linked };
}

/** The invite behind an emailed link, with enough context to describe it. */
export async function getEventPlanInviteByToken(token: string) {
  return db.query.eventPlanInvites.findFirst({
    where: eq(eventPlanInvites.token, token),
    with: {
      eventPlan: {
        columns: { id: true, title: true, eventDate: true, schoolId: true },
        with: { school: { columns: { name: true } } },
      },
      inviter: { columns: { name: true, email: true } },
    },
  });
}

/** Plans this email has been invited to but hasn't joined yet. */
export async function getPendingInvitesForPlan(eventPlanId: string) {
  return db.query.eventPlanInvites.findMany({
    where: and(
      eq(eventPlanInvites.eventPlanId, eventPlanId),
      eq(eventPlanInvites.status, "pending")
    ),
    with: { inviter: { columns: { name: true } } },
  });
}
