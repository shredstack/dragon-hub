/**
 * Plumbing shared by every public volunteer signup flow — the classroom-scoped
 * room parent signup and the general PTA volunteer interest campaigns.
 *
 * These flows differ entirely in what they collect but are identical in what
 * they do with a parent afterwards: validate the contact fields, attach them to
 * the school for the current year if they already have an account, and email a
 * one-click sign-in link. Keeping that here means a fix to (say) phone
 * normalization or the welcome email lands in both places at once.
 *
 * Deliberately not a "use server" module: these are internal helpers, not
 * server actions, and `normalizeContact` is synchronous.
 */

import { db } from "@/lib/db";
import {
  classroomMembers,
  schoolMemberships,
  users,
  volunteerSignups,
} from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { sendVolunteerWelcomeEmail } from "@/lib/email";
import { createSignInLink, getAppBaseUrl } from "@/lib/magic-link";
import { isValidEmail, isValidPhoneNumber, normalizePhoneNumber } from "@/lib/utils";

// ─── Contact Validation ────────────────────────────────────────────────────

export interface ContactInput {
  name: string;
  email: string;
  phone?: string;
}

export interface NormalizedContact {
  name: string;
  email: string;
  /** Digits only, matching how phone numbers are stored on `users`. */
  phone: string | null;
}

export type ContactValidation =
  | { ok: true; contact: NormalizedContact }
  | { ok: false; error: string };

/**
 * Validates and normalizes the contact fields shared by every signup path.
 * The forms validate the same rules client-side; this is the backstop for
 * direct action calls and stale clients.
 */
export function normalizeContact(data: ContactInput): ContactValidation {
  const name = data.name.trim();
  if (!name) {
    return { ok: false, error: "Please enter your name." };
  }

  const email = data.email.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return {
      ok: false,
      error: "Please enter a valid email address (for example, jane@example.com).",
    };
  }

  const phoneInput = data.phone?.trim() ?? "";
  if (phoneInput && !isValidPhoneNumber(phoneInput)) {
    return {
      ok: false,
      error: "Please enter a valid 10-digit phone number (for example, (555) 123-4567).",
    };
  }

  return { ok: true, contact: { name, email, phone: normalizePhoneNumber(phoneInput) } };
}

// ─── Account Linking ───────────────────────────────────────────────────────

/**
 * Looks up an existing account by email and, if found, makes sure it's attached
 * to this school for this year. Returns null when the email is new — those
 * parents get an account the first time they click the welcome email's link.
 *
 * A membership row already existing is not the same as access: a parent who was
 * taken off the roster (`removed`) or left over from last year (`expired`) still
 * has a row, and volunteering is exactly the moment to put them back on. Only
 * `revoked` is left alone — that status exists to mean "don't let them back in
 * without an administrator", and a public signup form must not override it.
 */
export async function linkExistingAccountToSchool(
  email: string,
  schoolId: string,
  schoolYear: string
) {
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!existingUser) return null;

  const existingMembership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, existingUser.id),
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, schoolYear)
    ),
  });

  if (!existingMembership) {
    await db.insert(schoolMemberships).values({
      userId: existingUser.id,
      schoolId,
      role: "member",
      schoolYear,
      status: "approved",
      approvedAt: new Date(),
    });
  } else if (
    existingMembership.status === "removed" ||
    existingMembership.status === "expired"
  ) {
    await db
      .update(schoolMemberships)
      .set({
        status: "approved",
        approvedAt: new Date(),
        // Same rule as rejoining with the code: back as a plain member, never
        // with a board position a signup form could hand back.
        ...(existingMembership.status === "removed"
          ? { role: "member" as const, boardPosition: null }
          : {}),
      })
      .where(eq(schoolMemberships.id, existingMembership.id));
  }

  return existingUser;
}

// ─── Signup Records ────────────────────────────────────────────────────────

/**
 * `volunteer_signups` is the single record of who volunteered for a classroom —
 * QR scans, the VP dashboard's manual add, and the classroom page's "Add Room
 * Parent" all land here. `classroom_members` stays purely an authorization
 * table, derived from these rows once the volunteer has an account.
 */

export type ClassroomVolunteerRole = "room_parent" | "party_volunteer";

/**
 * Grants a linked account access to the classroom its signup is for.
 *
 * Room parents outrank plain volunteers, so a party signup never demotes
 * someone who is already a room parent — but a room parent signup does promote
 * an existing volunteer.
 */
export async function ensureClassroomMembership(
  userId: string,
  classroomId: string,
  role: ClassroomVolunteerRole
) {
  const memberRole = role === "room_parent" ? "room_parent" : "volunteer";

  const existingMember = await db.query.classroomMembers.findFirst({
    where: and(
      eq(classroomMembers.userId, userId),
      eq(classroomMembers.classroomId, classroomId)
    ),
  });

  if (!existingMember) {
    await db.insert(classroomMembers).values({
      userId,
      classroomId,
      role: memberRole,
    });
    return;
  }

  if (memberRole === "room_parent" && existingMember.role === "volunteer") {
    await db
      .update(classroomMembers)
      .set({ role: "room_parent" })
      .where(eq(classroomMembers.id, existingMember.id));
  }
}

export type RecordSignupOutcome =
  | "created"
  | "reactivated"
  | "updated"
  | "already_active";

export interface RecordSignupParams {
  schoolId: string;
  classroomId: string;
  contact: NormalizedContact;
  role: ClassroomVolunteerRole;
  partyTypes?: string[] | null;
  signupSource: "qr_code" | "manual";
  notes?: string | null;
  /** The board member or teacher entering someone else's signup, if any. */
  createdBy?: string | null;
  /** Set when this email already has an account, so access can be granted now. */
  userId?: string | null;
}

/**
 * Writes a volunteer's signup for one classroom and grants classroom access if
 * they already have an account.
 *
 * Every caller has to go through here rather than inserting directly, so that
 * someone who was taken off the list gets their original row put back —
 * keeping its `createdAt`, notes and history — instead of accumulating a new
 * row per re-signup.
 *
 * `volunteer_signups_unique_active` is a PARTIAL unique index (`WHERE status =
 * 'active'`), so it only stops a second *active* row. Removed rows are
 * unconstrained and a classroom/email/role can therefore have any number of
 * them alongside one active row — which is exactly what earlier versions of
 * the signup flow produced, since they inserted a fresh row whenever no active
 * one was found. The lookup below has to account for that.
 */
export async function recordVolunteerSignup(
  params: RecordSignupParams
): Promise<{ outcome: RecordSignupOutcome; signupId: string }> {
  const {
    schoolId,
    classroomId,
    contact,
    role,
    partyTypes,
    signupSource,
    notes,
    createdBy,
    userId,
  } = params;

  const identity = and(
    eq(volunteerSignups.classroomId, classroomId),
    eq(volunteerSignups.email, contact.email),
    eq(volunteerSignups.role, role)
  );

  // The active row wins whenever there is one. Asking for "any row with this
  // identity" would return an arbitrary one, and picking a removed row while an
  // active row exists would send us down the reactivate branch — whose UPDATE
  // to status='active' then violates `volunteer_signups_unique_active`. The
  // partial index guarantees at most one active row, so this is unambiguous.
  const active = await db.query.volunteerSignups.findFirst({
    where: and(identity, eq(volunteerSignups.status, "active")),
  });

  // No active row: reactivate the most recent removed one, so the row we bring
  // back is the one carrying their latest notes and party types.
  const existing =
    active ??
    (await db.query.volunteerSignups.findFirst({
      where: identity,
      orderBy: [desc(volunteerSignups.createdAt)],
    }));

  let outcome: RecordSignupOutcome;
  let signupId: string;

  if (existing && existing.status === "active") {
    signupId = existing.id;
    // A parent re-scanning the QR to add a party they missed should extend
    // their existing signup, not be told they're already done.
    const addedTypes = (partyTypes ?? []).filter(
      (type) => !existing.partyTypes?.includes(type)
    );
    if (addedTypes.length > 0) {
      await db
        .update(volunteerSignups)
        .set({ partyTypes: [...(existing.partyTypes ?? []), ...addedTypes] })
        .where(eq(volunteerSignups.id, existing.id));
      outcome = "updated";
    } else {
      outcome = "already_active";
    }
  } else if (existing) {
    signupId = existing.id;
    await db
      .update(volunteerSignups)
      .set({
        status: "active",
        removedAt: null,
        removedBy: null,
        name: contact.name,
        phone: contact.phone,
        partyTypes: partyTypes && partyTypes.length > 0 ? partyTypes : null,
        signupSource,
        ...(notes !== undefined && notes !== null && { notes }),
        ...(userId && { userId }),
      })
      .where(eq(volunteerSignups.id, existing.id));
    outcome = "reactivated";
  } else {
    const [inserted] = await db
      .insert(volunteerSignups)
      .values({
        schoolId,
        classroomId,
        userId: userId ?? null,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        role,
        partyTypes: partyTypes && partyTypes.length > 0 ? partyTypes : null,
        signupSource,
        notes: notes ?? null,
        createdBy: createdBy ?? null,
      })
      .returning({ id: volunteerSignups.id });
    signupId = inserted.id;
    outcome = "created";
  }

  if (userId) {
    // An older row may predate the account. `linkVolunteerSignupsToUser` only
    // looks at rows where `userId` IS NULL, so a signup left unlinked for an
    // email that does have an account would never grant classroom access —
    // not on the next sign-in, not ever.
    if (existing && existing.userId !== userId) {
      await db
        .update(volunteerSignups)
        .set({ userId })
        .where(eq(volunteerSignups.id, signupId));
    }
    await ensureClassroomMembership(userId, classroomId, role);
  }

  return { outcome, signupId };
}

/**
 * Re-derives one person's classroom membership from their active signups.
 *
 * Membership isn't a boolean — `ensureClassroomMembership` promotes a volunteer
 * to `room_parent`, so anything that takes a signup away has to be able to walk
 * that back. Removing someone as room parent while they still hold a party
 * volunteer signup used to leave the membership row untouched at `room_parent`,
 * which `assertClassroomRole` reads as full manage rights over that classroom.
 *
 * Only signup-derived roles are managed here. A `teacher` or `pta_board`
 * membership was granted by an administrator, not by a signup, so it is left
 * alone rather than downgraded or deleted out from under them.
 *
 * Call this AFTER the signup rows are in their final state.
 */
export async function syncClassroomMembership(
  userId: string,
  classroomId: string
) {
  const membership = await db.query.classroomMembers.findFirst({
    where: and(
      eq(classroomMembers.userId, userId),
      eq(classroomMembers.classroomId, classroomId)
    ),
  });
  if (
    membership &&
    membership.role !== "room_parent" &&
    membership.role !== "volunteer"
  ) {
    return;
  }

  const active = await db.query.volunteerSignups.findMany({
    where: and(
      eq(volunteerSignups.userId, userId),
      eq(volunteerSignups.classroomId, classroomId),
      eq(volunteerSignups.status, "active")
    ),
    columns: { role: true },
  });

  if (active.length === 0) {
    if (membership) {
      await db.delete(classroomMembers).where(eq(classroomMembers.id, membership.id));
    }
    return;
  }

  const role = active.some((s) => s.role === "room_parent")
    ? "room_parent"
    : "volunteer";

  if (!membership) {
    await db.insert(classroomMembers).values({ userId, classroomId, role });
    return;
  }
  if (role !== membership.role) {
    await db
      .update(classroomMembers)
      .set({ role })
      .where(eq(classroomMembers.id, membership.id));
  }
}

/**
 * Soft-deletes a signup and re-derives the classroom membership it justified.
 */
export async function deactivateVolunteerSignup(
  signup: { id: string; classroomId: string; userId: string | null },
  removedBy: string
) {
  await db
    .update(volunteerSignups)
    .set({
      status: "removed",
      removedAt: new Date(),
      removedBy,
    })
    .where(eq(volunteerSignups.id, signup.id));

  if (!signup.userId) return;
  await syncClassroomMembership(signup.userId, signup.classroomId);
}

// ─── Welcome Email ─────────────────────────────────────────────────────────

/**
 * Sends the welcome email with a one-click sign-in link so a new volunteer
 * lands in the hub straight from this email instead of having to request a
 * separate magic link. Falls back to the sign-in page if the link can't be
 * minted (e.g. missing AUTH_SECRET).
 */
export async function sendWelcomeEmail(params: {
  email: string;
  name: string;
  schoolName: string;
  signups: Array<{ classroomName?: string; role: string }>;
  listIntro?: string;
  benefits?: string[];
  /** Where the sign-in link drops them. Defaults to the dashboard. */
  callbackPath?: string;
}) {
  const baseUrl = getAppBaseUrl();
  const fallbackSignInUrl = `${baseUrl}/sign-in`;

  let signInUrl = fallbackSignInUrl;
  let directSignIn = false;
  let expiresInHours: number | undefined;

  try {
    const link = await createSignInLink(params.email, {
      callbackPath: params.callbackPath ?? "/dashboard",
    });
    signInUrl = link.url;
    directSignIn = true;
    expiresInHours = link.expiresInHours;
  } catch (error) {
    console.error("Failed to create one-click sign-in link:", error);
  }

  await sendVolunteerWelcomeEmail({
    to: params.email,
    name: params.name,
    schoolName: params.schoolName,
    signups: params.signups,
    listIntro: params.listIntro,
    benefits: params.benefits,
    signInUrl,
    directSignIn,
    expiresInHours,
    fallbackSignInUrl,
  });
}
