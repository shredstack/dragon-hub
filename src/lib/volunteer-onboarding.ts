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

import { db, dbPool } from "@/lib/db";
import {
  classroomMembers,
  classrooms,
  schoolMemberships,
  schools,
  users,
  volunteerSignups,
} from "@/lib/db/schema";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { sendVolunteerWelcomeEmail } from "@/lib/email";
import { resolveVolunteerEligibility } from "@/lib/volunteer-eligibility";
import {
  resolveVolunteerSettings,
  roomParentWaitlistEnabled,
} from "@/lib/volunteer-settings";
import {
  waitlistPositionIn,
  waitlistQueueOrder,
  WAITLIST_SWEEP_LIMIT,
  type DbLike,
} from "@/lib/waitlist";
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
      source: "volunteer_signup",
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
  | "already_active"
  | "waitlisted" // Room full + waitlist enabled
  | "full"; // Room full + waitlist disabled

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
  /**
   * Enforce the classroom's room parent limit, sending overflow to the
   * waitlist. Only meaningful for `room_parent` — party volunteers have no cap.
   *
   * Omitting it means "no wall", which is what the board's manual add and the
   * classroom page's "Add Room Parent" deliberately do: someone entering a name
   * off a paper form is the override.
   */
  capacity?: { limit: number; waitlistEnabled: boolean };
}

export interface RecordSignupResult {
  outcome: RecordSignupOutcome;
  /** Null only when the outcome is `full` — there is no row to point at. */
  signupId: string | null;
  /** 1-based place in line, present only when the outcome is `waitlisted`. */
  waitlistPosition?: number;
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
): Promise<RecordSignupResult> {
  const { capacity, role, classroomId, userId } = params;

  // No wall to evaluate — party volunteers, and every path that deliberately
  // overrides the limit. Unchanged from before the waitlist existed.
  const enforcing = !!capacity && role === "room_parent";

  const result = enforcing
    ? await dbPool.transaction(async (tx) => {
        // The lock. Everything below decides who gets a seat, so it all has to
        // happen while this row is held — including the count of who already
        // has one, which a concurrent signup would otherwise change underneath
        // us. Two parents submitting at once at Back to School Night cannot
        // both take the last spot: one joins and the other is waitlisted.
        //
        // The classroom row is the thing being allocated against, so it is what
        // gets locked. (Committees lock their own row for exactly this reason.)
        await tx
          .select({ id: classrooms.id })
          .from(classrooms)
          .where(eq(classrooms.id, classroomId))
          .for("update");

        return writeSignup(tx, params, async () => {
          const [{ taken }] = await tx
            .select({ taken: count() })
            .from(volunteerSignups)
            .where(
              and(
                eq(volunteerSignups.classroomId, classroomId),
                eq(volunteerSignups.role, "room_parent"),
                eq(volunteerSignups.status, "active")
              )
            );
          return taken >= capacity!.limit;
        });
      })
    : await writeSignup(db, params, async () => false);

  // Access is granted outside the lock: the lock exists to allocate a seat, and
  // holding it across the membership writes would serialize far more than it
  // needs to. A waitlisted signup grants nothing — that is the whole difference
  // between a place in line and a seat.
  if (userId && result.signupId && result.outcome !== "waitlisted") {
    await ensureClassroomMembership(userId, classroomId, role);
  }

  return result;
}

/**
 * The row-level half of `recordVolunteerSignup`, run either directly or inside
 * the capacity transaction. `resolveFull` is consulted only when a new seat is
 * actually needed — a re-submit by someone who already holds one (or already
 * holds a place in line) never counts against the limit.
 */
async function writeSignup(
  tx: DbLike,
  params: RecordSignupParams,
  resolveFull: () => Promise<boolean>
): Promise<RecordSignupResult> {
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
    capacity,
  } = params;

  const identity = and(
    eq(volunteerSignups.classroomId, classroomId),
    eq(volunteerSignups.email, contact.email),
    eq(volunteerSignups.role, role)
  );

  // The open row wins whenever there is one. Asking for "any row with this
  // identity" would return an arbitrary one, and picking a removed row while an
  // open row exists would send us down the reactivate branch — whose UPDATE to
  // status='active' then violates `volunteer_signups_unique_open`. The partial
  // index guarantees at most one open row, so this is unambiguous.
  const [open] = await tx
    .select()
    .from(volunteerSignups)
    .where(and(identity, sql`${volunteerSignups.status} <> 'removed'`))
    .limit(1);

  // No open row: reactivate the most recent removed one, so the row we bring
  // back is the one carrying their latest notes and party types.
  const [removed] = open
    ? [undefined]
    : await tx
        .select()
        .from(volunteerSignups)
        .where(and(identity, eq(volunteerSignups.status, "removed")))
        .orderBy(desc(volunteerSignups.createdAt))
        .limit(1);

  const existing = open ?? removed;

  // An older row may predate the account. `linkVolunteerSignupsToUser` only
  // looks at rows where `userId` IS NULL, so a signup left unlinked for an
  // email that does have an account would never grant classroom access — not on
  // the next sign-in, not ever.
  const linkPatch = userId && existing?.userId !== userId ? { userId } : {};

  if (open?.status === "waitlisted") {
    // A re-submit never rewrites `waitlistedAt`, so resubmitting the form is
    // not a way to jump the queue — nor to lose your place in it.
    await tx
      .update(volunteerSignups)
      .set({ name: contact.name, phone: contact.phone, ...linkPatch })
      .where(eq(volunteerSignups.id, open.id));
    return {
      outcome: "waitlisted",
      signupId: open.id,
      waitlistPosition: await roomParentWaitlistPositionIn(tx, open),
    };
  }

  if (open) {
    // A parent re-scanning the QR to add a party they missed should extend
    // their existing signup, not be told they're already done.
    const addedTypes = (partyTypes ?? []).filter(
      (type) => !open.partyTypes?.includes(type)
    );
    const patch = {
      ...linkPatch,
      ...(addedTypes.length > 0
        ? { partyTypes: [...(open.partyTypes ?? []), ...addedTypes] }
        : {}),
    };
    if (Object.keys(patch).length > 0) {
      await tx
        .update(volunteerSignups)
        .set(patch)
        .where(eq(volunteerSignups.id, open.id));
    }
    return {
      outcome: addedTypes.length > 0 ? "updated" : "already_active",
      signupId: open.id,
    };
  }

  const full = await resolveFull();
  if (full && capacity && !capacity.waitlistEnabled) {
    return { outcome: "full", signupId: null };
  }

  const now = new Date();
  const status = full ? ("waitlisted" as const) : ("active" as const);
  const waitlistedAt = full ? now : null;

  let signupId: string;
  if (removed) {
    // Back to the row they already had, so their notes and original `createdAt`
    // survive. A fresh `waitlistedAt` puts a returning volunteer at the back of
    // the line rather than at the position their first signup would have
    // earned them.
    await tx
      .update(volunteerSignups)
      .set({
        status,
        waitlistedAt,
        promotedAt: null,
        removedAt: null,
        removedBy: null,
        name: contact.name,
        phone: contact.phone,
        partyTypes: partyTypes && partyTypes.length > 0 ? partyTypes : null,
        signupSource,
        ...(notes !== undefined && notes !== null && { notes }),
        ...(userId ? { userId } : {}),
      })
      .where(eq(volunteerSignups.id, removed.id));
    signupId = removed.id;
  } else {
    const [inserted] = await tx
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
        status,
        waitlistedAt,
        notes: notes ?? null,
        createdBy: createdBy ?? null,
      })
      // Bare `returning()` rather than a column list: this runs against either
      // the pooled transaction or the HTTP client, and only the former accepts
      // a projection.
      .returning();
    signupId = inserted.id;
  }

  if (full) {
    return {
      outcome: "waitlisted",
      signupId,
      waitlistPosition: await roomParentWaitlistPositionIn(tx, {
        classroomId,
        waitlistedAt: now,
      }),
    };
  }

  return { outcome: removed ? "reactivated" : "created", signupId };
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
 * Soft-deletes a signup, re-derives the classroom membership it justified, and
 * — when the vacancy is a room parent seat — promotes whoever is at the front
 * of that room's waitlist.
 */
export async function deactivateVolunteerSignup(
  signup: {
    id: string;
    classroomId: string;
    userId: string | null;
    /** Lets a party volunteer removal skip the promotion sweep entirely —
     *  that role has no cap, so it can't have freed a seat. Older callers that
     *  omit it just do the (harmless, empty) sweep. */
    role?: ClassroomVolunteerRole;
  },
  removedBy: string
) {
  await db
    .update(volunteerSignups)
    .set({
      status: "removed",
      removedAt: new Date(),
      removedBy,
      // A removed row is not in line. Clearing this also keeps it from
      // affecting anyone else's position if it is ever reactivated.
      waitlistedAt: null,
    })
    .where(eq(volunteerSignups.id, signup.id));

  if (signup.userId) {
    await syncClassroomMembership(signup.userId, signup.classroomId);
  }

  if (signup.role !== "party_volunteer") {
    await promoteFromRoomParentWaitlist(signup.classroomId, {
      promotedBy: removedBy,
    });
  }
}

// ─── Room Parent Waitlist ──────────────────────────────────────────────────

/**
 * Fills open room parent seats from the waitlist, oldest `waitlistedAt` first,
 * and emails each promoted volunteer. Runs inside the same classroom row lock
 * the capacity check uses, so a promotion and a fresh signup can't claim the
 * same seat.
 *
 * Promotion is automatic by design: a waitlist that needs a human to notice a
 * vacancy is just a list. The board can still promote out of order by passing
 * `signupId` — the parent who has done it three years running shouldn't have to
 * wait for two people to drop.
 *
 * Also worth calling when `roomParentLimit` is raised, since new seats should
 * fill themselves.
 */
export async function promoteFromRoomParentWaitlist(
  classroomId: string,
  options?: { signupId?: string; promotedBy?: string }
): Promise<{ promoted: number }> {
  const promoted = await dbPool.transaction(async (tx) => {
    const [classroom] = await tx
      .select({ id: classrooms.id, name: classrooms.name, schoolId: classrooms.schoolId })
      .from(classrooms)
      .where(eq(classrooms.id, classroomId))
      .for("update");

    // `schoolId` is still nullable in the schema, and without it there is no
    // limit to promote up to. Nothing to do rather than guess one.
    if (!classroom?.schoolId) return [];

    const school = await tx
      .select({ name: schools.name, volunteerSettings: schools.volunteerSettings })
      .from(schools)
      .where(eq(schools.id, classroom.schoolId))
      .limit(1);
    if (school.length === 0) return [];
    const settings = resolveVolunteerSettings(school[0].volunteerSettings);

    const [{ taken }] = await tx
      .select({ taken: count() })
      .from(volunteerSignups)
      .where(
        and(
          eq(volunteerSignups.classroomId, classroomId),
          eq(volunteerSignups.role, "room_parent"),
          eq(volunteerSignups.status, "active")
        )
      );

    const seats = settings.roomParentLimit - taken;
    if (seats <= 0) return [];

    const queue = await tx
      .select()
      .from(volunteerSignups)
      .where(
        and(
          eq(volunteerSignups.classroomId, classroomId),
          eq(volunteerSignups.role, "room_parent"),
          eq(volunteerSignups.status, "waitlisted"),
          ...(options?.signupId
            ? [eq(volunteerSignups.id, options.signupId)]
            : [])
        )
      )
      .orderBy(waitlistQueueOrder(volunteerSignups.waitlistedAt))
      .limit(Math.min(seats, WAITLIST_SWEEP_LIMIT));

    if (queue.length === 0) return [];

    const now = new Date();
    for (const row of queue) {
      await tx
        .update(volunteerSignups)
        .set({ status: "active", waitlistedAt: null, promotedAt: now })
        .where(eq(volunteerSignups.id, row.id));
    }

    return queue.map((row) => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      schoolId: row.schoolId,
      schoolName: school[0].name,
      classroomName: classroom.name,
    }));
  });

  // Access and email happen after the commit — a Resend outage must not roll
  // back a promotion that has already been decided.
  for (const person of promoted) {
    if (person.userId) {
      await ensureClassroomMembership(person.userId, classroomId, "room_parent");
    }
    try {
      await sendWaitlistPromotionEmail({
        schoolId: person.schoolId,
        schoolName: person.schoolName,
        email: person.email,
        name: person.name,
        signups: [{ classroomName: person.classroomName, role: "Room Parent" }],
        benefits: [
          "A private message board with the teacher",
          "The classroom's shared task list",
          "Contact info for the other room parents",
        ],
        callbackPath: "/classrooms",
      });
    } catch (error) {
      console.error("Failed to send room parent promotion email:", error);
    }
  }

  return { promoted: promoted.length };
}

/** The line for one classroom's room parent seats. */
function roomParentWaitlistPositionIn(
  tx: DbLike,
  row: { classroomId: string; waitlistedAt: Date | null }
): Promise<number> {
  return waitlistPositionIn({
    tx,
    table: volunteerSignups,
    statusColumn: volunteerSignups.status,
    waitlistedAtColumn: volunteerSignups.waitlistedAt,
    waitlistedAt: row.waitlistedAt,
    scope: [
      sql`${volunteerSignups.classroomId} = ${row.classroomId}`,
      sql`${volunteerSignups.role} = 'room_parent'`,
    ],
  });
}

/** Public read of a waitlisted room parent's place in line. */
export async function getRoomParentWaitlistPosition(
  signupId: string
): Promise<number | null> {
  const row = await db.query.volunteerSignups.findFirst({
    where: eq(volunteerSignups.id, signupId),
    columns: { classroomId: true, waitlistedAt: true, status: true },
  });
  if (!row || row.status !== "waitlisted") return null;
  return roomParentWaitlistPositionIn(db, row);
}

/**
 * Whether a classroom's room parent spots are full, and what happens next if
 * they are. Read before rendering a signup form or a coverage table so the page
 * and the write behind it can't drift into disagreeing.
 */
export async function getRoomParentCapacity(
  schoolId: string
): Promise<{ limit: number; waitlistEnabled: boolean }> {
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { volunteerSettings: true },
  });
  const settings = resolveVolunteerSettings(school?.volunteerSettings);
  return {
    limit: settings.roomParentLimit,
    waitlistEnabled: roomParentWaitlistEnabled(settings),
  };
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
  /**
   * Used to look up the school's district volunteer-application reminder, so
   * every welcome email carries it without each caller remembering to pass it.
   */
  schoolId: string;
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

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, params.schoolId),
    columns: { volunteerSettings: true },
  });

  await sendVolunteerWelcomeEmail({
    to: params.email,
    name: params.name,
    schoolName: params.schoolName,
    eligibility: resolveVolunteerEligibility(
      school?.volunteerSettings?.eligibility
    ),
    signups: params.signups,
    listIntro: params.listIntro,
    benefits: params.benefits,
    signInUrl,
    directSignIn,
    expiresInHours,
    fallbackSignInUrl,
  });
}

/**
 * "A spot opened up and you're in." Sent when anything promotes someone off a
 * waitlist — a committee seat, a room parent spot — so the one email a parent
 * gets after weeks of waiting reads the same either way.
 *
 * It is the welcome email with a different opening line, deliberately: the
 * one-click sign-in link is exactly what a promoted volunteer needs, and half of
 * them have never signed in at all.
 */
export async function sendWaitlistPromotionEmail(params: {
  schoolId: string;
  schoolName: string;
  email: string;
  name: string;
  /** What they were promoted into, in the welcome email's list shape. */
  signups: Array<{ classroomName?: string; role: string }>;
  benefits?: string[];
  callbackPath?: string;
}) {
  await sendWelcomeEmail({
    email: params.email,
    name: params.name,
    schoolId: params.schoolId,
    schoolName: params.schoolName,
    signups: params.signups,
    listIntro: "A spot opened up and you're in! You're now on:",
    benefits: params.benefits,
    callbackPath: params.callbackPath,
  });
}
