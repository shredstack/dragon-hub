"use server";

import { randomBytes } from "crypto";
import { and, eq, ilike, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  eventPlanInvites,
  eventPlanMembers,
  eventPlans,
  schoolMemberships,
  users,
} from "@/lib/db/schema";
import {
  assertAuthenticated,
  assertEventPlanWriteAccess,
} from "@/lib/auth-helpers";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { createSignInLink, getAppBaseUrl } from "@/lib/magic-link";
import { sendEventPlanInviteEmail } from "@/lib/email";
import { normalizeInviteEmail } from "@/lib/event-plan-invites";
import { resolveLeadType } from "@/lib/event-plan-leads";
import type { EventPlanLeadType, EventPlanMemberRole } from "@/types";

/** Loose enough for real addresses, strict enough to catch a typo'd form. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The plan plus the school it belongs to — needed by every path below. */
async function getPlanForInvite(eventPlanId: string) {
  const plan = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, eventPlanId),
    with: { school: { columns: { id: true, name: true } } },
  });
  if (!plan?.school) throw new Error("Event plan not found");
  return { plan, school: plan.school };
}

/**
 * School members a lead can add to their plan.
 *
 * Not `searchUsers` from admin.ts: that one requires PTA board, but adding
 * members is a lead's job and most leads aren't on the board. Scope is the same
 * — approved members of this plan's school for its active year — with the
 * people already on the plan filtered out.
 */
export async function searchEventPlanCandidates(
  eventPlanId: string,
  query: string
) {
  const user = await assertAuthenticated();
  await assertEventPlanWriteAccess(user.id!, eventPlanId, ["lead"]);

  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const { school } = await getPlanForInvite(eventPlanId);
  const schoolYear = await getSchoolCurrentYear(school.id);

  const [existingMembers, pendingInvites] = await Promise.all([
    db.query.eventPlanMembers.findMany({
      where: eq(eventPlanMembers.eventPlanId, eventPlanId),
      columns: { userId: true },
    }),
    db.query.eventPlanInvites.findMany({
      where: and(
        eq(eventPlanInvites.eventPlanId, eventPlanId),
        eq(eventPlanInvites.status, "pending")
      ),
      columns: { email: true },
    }),
  ]);
  const memberIds = new Set(existingMembers.map((m) => m.userId));
  const invitedEmails = new Set(pendingInvites.map((i) => i.email));

  const matches = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .innerJoin(
      schoolMemberships,
      and(
        eq(users.id, schoolMemberships.userId),
        eq(schoolMemberships.schoolId, school.id),
        eq(schoolMemberships.schoolYear, schoolYear),
        eq(schoolMemberships.status, "approved")
      )
    )
    .where(
      or(ilike(users.email, `%${trimmed}%`), ilike(users.name, `%${trimmed}%`))
    )
    .limit(20);

  return matches.filter(
    (m) =>
      !memberIds.has(m.id) &&
      !invitedEmails.has(normalizeInviteEmail(m.email))
  );
}

interface InviteByEmailInput {
  email: string;
  /** Optional — the inviter often knows only the address. */
  name?: string;
  role?: EventPlanMemberRole;
  /**
   * Which kind of lead, where the inviter knows — a committee chair invited by
   * email is the common case. Left out, it's worked out when they arrive.
   */
  leadType?: EventPlanLeadType;
  /** A line from the inviter, quoted in the email. */
  message?: string;
}

export type InviteByEmailResult =
  | { outcome: "added"; name: string }
  | { outcome: "invited"; email: string };

/**
 * Bring someone onto a plan by email address.
 *
 * Two outcomes, and the caller shouldn't have to know which applies in advance:
 * if the address already belongs to a member of this school, they're added
 * straight away — sending them an invitation to an app they're already signed
 * into would be silly. Otherwise a pending invite is recorded and emailed, and
 * they become a member when they accept.
 */
export async function inviteEventPlanMemberByEmail(
  eventPlanId: string,
  input: InviteByEmailInput
): Promise<InviteByEmailResult> {
  const user = await assertAuthenticated();
  await assertEventPlanWriteAccess(user.id!, eventPlanId, ["lead"]);

  const email = normalizeInviteEmail(input.email);
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  const role: EventPlanMemberRole = input.role === "lead" ? "lead" : "member";
  const leadType = role === "lead" ? (input.leadType ?? null) : null;
  const { school } = await getPlanForInvite(eventPlanId);
  const schoolYear = await getSchoolCurrentYear(school.id);

  // Already has an account *and* belongs to this school — no invitation needed.
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true, name: true, email: true },
  });

  if (existingUser) {
    const membership = await db.query.schoolMemberships.findFirst({
      where: and(
        eq(schoolMemberships.userId, existingUser.id),
        eq(schoolMemberships.schoolId, school.id),
        eq(schoolMemberships.schoolYear, schoolYear),
        eq(schoolMemberships.status, "approved")
      ),
    });

    if (membership) {
      await db
        .insert(eventPlanMembers)
        .values({
          eventPlanId,
          userId: existingUser.id,
          role,
          // Added straight away rather than invited, so their lead type is
          // settled here — a lead with none is an unowned event as far as the
          // year-planning screen is concerned.
          leadType:
            role === "lead"
              ? await resolveLeadType({
                  eventPlanId,
                  userId: existingUser.id,
                  schoolId: school.id,
                  schoolYear,
                  preferred: leadType,
                })
              : null,
        })
        .onConflictDoNothing();
      revalidatePath(`/events/${eventPlanId}`);
      return {
        outcome: "added",
        name: existingUser.name || existingUser.email,
      };
    }
    // Has an account but no membership here (new school, lapsed year). The
    // invite path handles both, since accepting grants membership too.
  }

  // Re-inviting reissues the link on the existing row rather than leaving two
  // live tokens for the same person.
  const token = randomBytes(32).toString("hex");
  const [invite] = await db
    .insert(eventPlanInvites)
    .values({
      eventPlanId,
      email,
      name: input.name?.trim() || null,
      role,
      leadType,
      token,
      invitedBy: user.id!,
    })
    .onConflictDoUpdate({
      target: [eventPlanInvites.eventPlanId, eventPlanInvites.email],
      set: {
        role,
        leadType,
        token,
        name: input.name?.trim() || null,
        status: "pending",
        invitedBy: user.id!,
        acceptedAt: null,
        acceptedBy: null,
        createdAt: new Date(),
      },
    })
    .returning();

  await sendInviteEmail(invite.id);

  revalidatePath(`/events/${eventPlanId}`);
  return { outcome: "invited", email };
}

/**
 * Send (or resend) the email for a pending invite.
 *
 * The button in the email is a one-click sign-in link pointed at the accept
 * page, so an invitee who has never used Dragon Hub goes from their inbox to
 * the event in a single click instead of requesting a second magic link. If it
 * expires, the accept page still works — it just asks them to sign in first.
 */
async function sendInviteEmail(inviteId: string) {
  const invite = await db.query.eventPlanInvites.findFirst({
    where: eq(eventPlanInvites.id, inviteId),
    with: {
      eventPlan: {
        columns: { title: true, eventDate: true },
        with: { school: { columns: { name: true } } },
      },
      inviter: { columns: { name: true, email: true } },
    },
  });
  if (!invite?.eventPlan?.school) return;

  const acceptPath = `/event-invite/${invite.token}`;
  let acceptUrl = `${getAppBaseUrl()}${acceptPath}`;
  try {
    const link = await createSignInLink(invite.email, {
      callbackPath: acceptPath,
    });
    acceptUrl = link.url;
  } catch (error) {
    // A misconfigured base URL or secret shouldn't sink the invitation — the
    // plain accept link still works, it just asks them to sign in on arrival.
    console.error("Falling back to a plain invite link:", error);
  }

  await sendEventPlanInviteEmail({
    to: invite.email,
    inviteeName: invite.name,
    eventTitle: invite.eventPlan.title,
    eventDate: invite.eventPlan.eventDate
      ? invite.eventPlan.eventDate.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : null,
    schoolName: invite.eventPlan.school.name,
    inviterName: invite.inviter?.name || invite.inviter?.email || "The PTA",
    role: invite.role,
    acceptUrl,
  });
}

export async function resendEventPlanInvite(inviteId: string) {
  const user = await assertAuthenticated();
  const invite = await db.query.eventPlanInvites.findFirst({
    where: eq(eventPlanInvites.id, inviteId),
  });
  if (!invite) throw new Error("Invitation not found");
  await assertEventPlanWriteAccess(user.id!, invite.eventPlanId, ["lead"]);
  if (invite.status !== "pending") {
    throw new Error("That invitation has already been used.");
  }

  await sendInviteEmail(inviteId);
  return { success: true };
}

export async function revokeEventPlanInvite(inviteId: string) {
  const user = await assertAuthenticated();
  const invite = await db.query.eventPlanInvites.findFirst({
    where: eq(eventPlanInvites.id, inviteId),
  });
  if (!invite) throw new Error("Invitation not found");
  await assertEventPlanWriteAccess(user.id!, invite.eventPlanId, ["lead"]);

  // Revoked rather than deleted: the emailed link stays dead, and re-inviting
  // later flips the same row back to pending with a fresh token.
  await db
    .update(eventPlanInvites)
    .set({ status: "revoked" })
    .where(
      and(eq(eventPlanInvites.id, inviteId), ne(eventPlanInvites.status, "accepted"))
    );

  revalidatePath(`/events/${invite.eventPlanId}`);
}
