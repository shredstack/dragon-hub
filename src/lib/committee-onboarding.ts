/**
 * Plumbing shared by every committee sign-up path — the public join page, the
 * room parent signup add-on, and the board's manual add.
 *
 * This is the committee counterpart to [volunteer-onboarding.ts], and it reuses
 * that module rather than reimplementing it: `normalizeContact`,
 * `linkExistingAccountToSchool`, `ensureClassroomMembership` and
 * `sendWelcomeEmail` all apply unchanged. What is genuinely different lives
 * here: capacity, the waitlist, and the promotion that fills a vacancy.
 *
 * Deliberately not a "use server" module — `linkCommitteeSignupsToUser` is
 * called from NextAuth events, exactly like [volunteer-linking.ts], and server
 * actions cannot be imported into that context.
 */

import { db, dbPool } from "@/lib/db";
import {
  committeeMembers,
  committees,
  committeeSignups,
  eventPlanMembers,
  schoolMemberships,
  schools,
} from "@/lib/db/schema";
import { and, count, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";
import {
  ensureClassroomMembership,
  sendWelcomeEmail,
  type NormalizedContact,
} from "@/lib/volunteer-onboarding";

export type CommitteeRole = "chair" | "member";

/** The subset of a committee row every capacity decision needs. */
type CommitteeCapacityRow = {
  id: string;
  schoolId: string;
  name: string;
  status: "draft" | "active" | "closed";
  archivedAt: Date | null;
  opensAt: Date | null;
  closesAt: Date | null;
  capacityMode: "open" | "capped";
  maxSize: number | null;
  /** Per-classroom cap for a per-classroom committee (MTM); null otherwise. */
  perClassroomLimit: number | null;
  waitlistEnabled: boolean;
};

/** Any drizzle handle — the real `db`, or a transaction. */
type DbLike = typeof db | Parameters<Parameters<typeof dbPool.transaction>[0]>[0];

// ─── Membership ────────────────────────────────────────────────────────────

/**
 * Grants a linked account access to a committee. Chair outranks member, so a
 * plain-member signup never demotes someone the board has made chair — but a
 * chair signup does promote an existing member.
 *
 * When the committee has `grantsLinkedAccess`, this also grants access to
 * whatever it is scoped to. That flag is off by default precisely because a
 * public join link must not hand out an event plan's budget and vendor
 * contacts by accident.
 */
export async function ensureCommitteeMembership(
  userId: string,
  committeeId: string,
  role: CommitteeRole
): Promise<void> {
  const existing = await db.query.committeeMembers.findFirst({
    where: and(
      eq(committeeMembers.userId, userId),
      eq(committeeMembers.committeeId, committeeId)
    ),
  });

  if (!existing) {
    await db.insert(committeeMembers).values({ committeeId, userId, role });
  } else if (role === "chair" && existing.role === "member") {
    await db
      .update(committeeMembers)
      .set({ role: "chair" })
      .where(eq(committeeMembers.id, existing.id));
  }

  await grantLinkedAccess(userId, committeeId);
}

/**
 * The `grantsLinkedAccess` half of `ensureCommitteeMembership`.
 *
 * Note the roles granted are deliberately the *lower* of each pair: a committee
 * join grants classroom `volunteer` (never `room_parent`) and event plan
 * `member` (never `lead`). Joining a committee is not a claim on running the
 * thing it's attached to.
 */
async function grantLinkedAccess(userId: string, committeeId: string) {
  const committee = await db.query.committees.findFirst({
    where: eq(committees.id, committeeId),
    columns: {
      grantsLinkedAccess: true,
      scope: true,
      classroomId: true,
      eventPlanId: true,
    },
  });
  if (!committee?.grantsLinkedAccess) return;

  if (committee.scope === "classroom" && committee.classroomId) {
    await ensureClassroomMembership(
      userId,
      committee.classroomId,
      "party_volunteer"
    );
    return;
  }

  if (committee.scope === "event_plan" && committee.eventPlanId) {
    await db
      .insert(eventPlanMembers)
      .values({
        eventPlanId: committee.eventPlanId,
        userId,
        role: "member",
      })
      .onConflictDoNothing();
  }
}

/**
 * Re-derives one person's committee membership from their signups. Deletes the
 * row when no active signup remains.
 *
 * Access granted through `grantsLinkedAccess` is deliberately NOT revoked here:
 * the person may hold that classroom or event access for reasons of their own,
 * and `syncClassroomMembership` already re-derives classroom access from its
 * own signups. The admin UI says so out loud.
 *
 * Call this AFTER the signup rows are in their final state.
 */
export async function syncCommitteeMembership(
  userId: string,
  committeeId: string
): Promise<void> {
  const active = await db.query.committeeSignups.findMany({
    where: and(
      eq(committeeSignups.userId, userId),
      eq(committeeSignups.committeeId, committeeId),
      eq(committeeSignups.status, "active")
    ),
    columns: { role: true },
  });

  const membership = await db.query.committeeMembers.findFirst({
    where: and(
      eq(committeeMembers.userId, userId),
      eq(committeeMembers.committeeId, committeeId)
    ),
  });

  // A waitlisted signup is not a seat, so it grants nothing here — the parent
  // sees "you're #3 in line" on the list page and no message board.
  if (active.length === 0) {
    if (membership) {
      await db
        .delete(committeeMembers)
        .where(eq(committeeMembers.id, membership.id));
    }
    return;
  }

  const role: CommitteeRole = active.some((s) => s.role === "chair")
    ? "chair"
    : "member";

  if (!membership) {
    await db.insert(committeeMembers).values({ committeeId, userId, role });
    return;
  }
  if (role !== membership.role) {
    await db
      .update(committeeMembers)
      .set({ role })
      .where(eq(committeeMembers.id, membership.id));
  }
}

// ─── Signup Records ────────────────────────────────────────────────────────

export type RecordCommitteeSignupOutcome =
  | "created" // Joined, seat taken
  | "reactivated" // Previously removed, original row restored
  | "already_active" // Idempotent re-submit
  | "waitlisted" // Capped + full + waitlist enabled
  | "full" // Capped + full + waitlist disabled
  | "closed"; // Draft, archived, or outside opensAt/closesAt

export interface RecordCommitteeSignupParams {
  schoolId: string;
  committeeId: string;
  contact: NormalizedContact;
  /**
   * The classroom this volunteer is covering, for a per-classroom committee
   * (MTM). Ignored for a school-wide committee. When set, capacity is counted
   * per classroom against `perClassroomLimit`, and the waitlist is per classroom.
   */
  classroomId?: string | null;
  role?: CommitteeRole;
  willingToChair?: boolean;
  notes?: string | null;
  schoolYear: string;
  signupSource: "qr_code" | "manual";
  /** The board member entering someone else's signup, if any. */
  createdBy?: string | null;
  /** Set when this email already has an account, so access can be granted now. */
  userId?: string | null;
  /**
   * Board's manual add: seats someone past a full committee. A board member
   * adding a name from a paper form knows what they're doing — but the
   * confirmation dialog says the cap is being exceeded.
   */
  bypassCapacity?: boolean;
  /**
   * Board's manual add: lets the board seed a `draft` committee (or one whose
   * window has closed) with its chair before the join link goes live.
   */
  allowClosed?: boolean;
}

export interface RecordCommitteeSignupResult {
  outcome: RecordCommitteeSignupOutcome;
  signupId: string | null;
  /** 1-based place in line, present only when the outcome is `waitlisted`. */
  waitlistPosition?: number;
}

/**
 * The single write path for committee sign-ups — the public join page, the room
 * parent add-on, and the board's manual add all go through here, so a removed
 * volunteer's original row is reactivated (keeping its `createdAt` and notes)
 * instead of accumulating a row per re-signup.
 *
 * Capacity is evaluated inside a transaction that takes a row lock on the
 * committee (`SELECT ... FOR UPDATE`), so two parents submitting at once at
 * Back to School Night cannot both take the last slot — one joins and the
 * other is waitlisted. (The room parent flow does its equivalent check
 * unlocked today and can overshoot `roomParentLimit` under concurrency; this
 * is the corrected version of that pattern.)
 *
 * An `open` committee never consults `minSize` — a minimum is a recruiting
 * goal, and refusing the 4th volunteer because you wanted 5 makes no sense.
 *
 * Never sends email. The public join action sends the welcome email itself, and
 * the room parent path deliberately suppresses it so one submission produces
 * one combined email rather than three.
 */
export async function recordCommitteeSignup(
  params: RecordCommitteeSignupParams
): Promise<RecordCommitteeSignupResult> {
  const {
    schoolId,
    committeeId,
    contact,
    classroomId = null,
    role = "member",
    willingToChair = false,
    notes,
    schoolYear,
    signupSource,
    createdBy,
    userId,
    bypassCapacity = false,
    allowClosed = false,
  } = params;

  const result = await dbPool.transaction(async (tx) => {
    // The lock. Everything below decides who gets a seat, so it all has to
    // happen while this row is held — including the count of who already has
    // one, which a concurrent signup would otherwise change underneath us.
    const [committee] = await tx
      .select({
        id: committees.id,
        schoolId: committees.schoolId,
        name: committees.name,
        status: committees.status,
        archivedAt: committees.archivedAt,
        opensAt: committees.opensAt,
        closesAt: committees.closesAt,
        capacityMode: committees.capacityMode,
        maxSize: committees.maxSize,
        perClassroomLimit: committees.perClassroomLimit,
        waitlistEnabled: committees.waitlistEnabled,
      })
      .from(committees)
      .where(eq(committees.id, committeeId))
      .for("update");

    if (!committee || committee.schoolId !== schoolId) {
      return { outcome: "closed" as const, signupId: null };
    }
    if (!allowClosed && !isCommitteeOpen(committee)) {
      return { outcome: "closed" as const, signupId: null };
    }

    // The partial unique index guarantees at most one row here that is not
    // `removed`; the removed ones are the re-signup history and there may be
    // any number of them, so take the newest.
    const rows = await tx
      .select()
      .from(committeeSignups)
      .where(
        and(
          eq(committeeSignups.committeeId, committeeId),
          eq(committeeSignups.email, contact.email)
        )
      )
      .orderBy(desc(committeeSignups.createdAt));

    const openRow = rows.find(
      (r) => r.status === "active" || r.status === "waitlisted"
    );
    const removedRow = rows.find((r) => r.status === "removed");

    // Contact details are always refreshed from the latest submission —
    // a parent correcting their phone number shouldn't have to ask.
    const contactPatch = {
      name: contact.name,
      phone: contact.phone,
      // Interest in chairing only ever turns on. Someone who ticked the box
      // once shouldn't have it silently cleared by a later re-submit that
      // didn't ask (the room parent add-on doesn't show the box unchecked).
      ...(willingToChair ? { willingToChair: true } : {}),
      ...(notes !== undefined && notes !== null && notes !== "" ? { notes } : {}),
      ...(userId ? { userId } : {}),
    };

    if (openRow) {
      await tx
        .update(committeeSignups)
        .set(contactPatch)
        .where(eq(committeeSignups.id, openRow.id));

      // A re-submit never rewrites `waitlistedAt`, so resubmitting the form is
      // not a way to jump the queue — nor to lose your place in it.
      if (openRow.status === "waitlisted") {
        return {
          outcome: "waitlisted" as const,
          signupId: openRow.id,
          waitlistPosition: await waitlistPositionWithin(tx, openRow),
        };
      }
      return { outcome: "already_active" as const, signupId: openRow.id };
    }

    const [{ taken }] = await tx
      .select({ taken: count() })
      .from(committeeSignups)
      .where(
        and(
          eq(committeeSignups.committeeId, committeeId),
          eq(committeeSignups.status, "active")
        )
      );

    // The school-wide wall (Yearbook), unchanged.
    const schoolWideFull =
      committee.capacityMode === "capped" &&
      committee.maxSize !== null &&
      taken >= committee.maxSize;

    // The per-classroom wall (MTM). Counts only this classroom's seats. A
    // per-classroom committee with no classroom on the signup (shouldn't
    // happen from the room parent page) simply isn't gated per classroom.
    let classroomFull = false;
    if (committee.perClassroomLimit !== null && classroomId) {
      const [{ inRoom }] = await tx
        .select({ inRoom: count() })
        .from(committeeSignups)
        .where(
          and(
            eq(committeeSignups.committeeId, committeeId),
            eq(committeeSignups.classroomId, classroomId),
            eq(committeeSignups.status, "active")
          )
        );
      classroomFull = inRoom >= committee.perClassroomLimit;
    }

    const full = !bypassCapacity && (schoolWideFull || classroomFull);

    if (full && !committee.waitlistEnabled) {
      return { outcome: "full" as const, signupId: null };
    }

    const now = new Date();
    const status = full ? ("waitlisted" as const) : ("active" as const);
    const waitlistedAt = full ? now : null;

    let signupId: string;
    if (removedRow) {
      // Back to the row they already had, so their notes and original
      // `createdAt` survive. A fresh `waitlistedAt` puts a returning volunteer
      // at the back of the line rather than at the position their first signup
      // would have earned them.
      await tx
        .update(committeeSignups)
        .set({
          ...contactPatch,
          classroomId,
          status,
          role,
          waitlistedAt,
          promotedAt: null,
          removedAt: null,
          removedBy: null,
          signupSource,
        })
        .where(eq(committeeSignups.id, removedRow.id));
      signupId = removedRow.id;
    } else {
      const [inserted] = await tx
        .insert(committeeSignups)
        .values({
          schoolId,
          committeeId,
          classroomId,
          userId: userId ?? null,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          role,
          willingToChair,
          notes: notes ?? null,
          schoolYear,
          signupSource,
          status,
          waitlistedAt,
          createdBy: createdBy ?? null,
        })
        .returning({ id: committeeSignups.id });
      signupId = inserted.id;
    }

    if (full) {
      return {
        outcome: "waitlisted" as const,
        signupId,
        waitlistPosition: await waitlistPositionWithin(tx, {
          committeeId,
          waitlistedAt: now,
          classroomId,
        }),
      };
    }
    return {
      outcome: removedRow ? ("reactivated" as const) : ("created" as const),
      signupId,
    };
  });

  // Membership is granted outside the lock: the lock exists to allocate a seat,
  // and holding it across the linked-access writes would serialize far more
  // than it needs to.
  if (userId && (result.outcome === "created" || result.outcome === "reactivated")) {
    await ensureCommitteeMembership(userId, committeeId, role);
  }

  return result;
}

/**
 * Soft-deletes a signup, re-derives the membership it justified, and — when the
 * vacancy is in a capped committee — promotes whoever is at the front of the
 * waitlist.
 */
export async function deactivateCommitteeSignup(
  signup: {
    id: string;
    committeeId: string;
    userId: string | null;
    /** The room the seat was in, so a per-classroom vacancy backfills from the
     *  right line. Undefined (older callers) sweeps every room. */
    classroomId?: string | null;
  },
  removedBy: string
): Promise<void> {
  await db
    .update(committeeSignups)
    .set({ status: "removed", removedAt: new Date(), removedBy, waitlistedAt: null })
    .where(eq(committeeSignups.id, signup.id));

  if (signup.userId) {
    await syncCommitteeMembership(signup.userId, signup.committeeId);
  }

  await promoteFromCommitteeWaitlist(signup.committeeId, {
    promotedBy: removedBy,
    ...(signup.classroomId !== undefined
      ? { classroomId: signup.classroomId }
      : {}),
  });
}

/**
 * Fills open seats from the waitlist, oldest `waitlistedAt` first, and emails
 * each promoted volunteer. Runs inside the same row lock the capacity check
 * uses, so a promotion and a fresh signup can't claim the same seat.
 *
 * Promotion is automatic by design: a waitlist that needs a human to notice a
 * vacancy is just a list. The board can still promote out of order by passing
 * `signupId` — a chair-shaped volunteer sitting at position 4 shouldn't have to
 * wait for three people to drop.
 *
 * Also called when `maxSize` is raised or a committee is switched from `capped`
 * to `open`, since new seats should fill themselves.
 *
 * A per-classroom committee (MTM) promotes per classroom: a Room 12 vacancy
 * fills from the Room 12 line, never from Room 8's. Passing `classroomId` scopes
 * a promotion to one room (a removal there), while omitting it sweeps every room
 * that has both a vacancy and a waitlist (a limit being raised).
 */
export async function promoteFromCommitteeWaitlist(
  committeeId: string,
  options?: { signupId?: string; classroomId?: string | null; promotedBy?: string }
): Promise<{ promoted: number }> {
  const promoted = await dbPool.transaction(async (tx) => {
    const [committee] = await tx
      .select({
        id: committees.id,
        schoolId: committees.schoolId,
        name: committees.name,
        capacityMode: committees.capacityMode,
        maxSize: committees.maxSize,
        perClassroomLimit: committees.perClassroomLimit,
      })
      .from(committees)
      .where(eq(committees.id, committeeId))
      .for("update");

    if (!committee) return [];

    const now = new Date();
    let queue: (typeof committeeSignups.$inferSelect)[] = [];

    if (committee.perClassroomLimit !== null) {
      // Per-classroom: each room fills its own seats from its own line.
      const limit = committee.perClassroomLimit;

      // Which rooms to consider. A specific `signupId` pins us to that person's
      // room; an explicit `classroomId` to that room; otherwise every room with
      // someone waiting (a raised limit should fill them all).
      let classroomIds: (string | null)[];
      if (options?.signupId) {
        const [row] = await tx
          .select({ classroomId: committeeSignups.classroomId })
          .from(committeeSignups)
          .where(eq(committeeSignups.id, options.signupId));
        if (!row) return [];
        classroomIds = [row.classroomId];
      } else if (options?.classroomId !== undefined) {
        classroomIds = [options.classroomId];
      } else {
        const rooms = await tx
          .select({ classroomId: committeeSignups.classroomId })
          .from(committeeSignups)
          .where(
            and(
              eq(committeeSignups.committeeId, committeeId),
              eq(committeeSignups.status, "waitlisted")
            )
          )
          .groupBy(committeeSignups.classroomId);
        classroomIds = rooms.map((r) => r.classroomId);
      }

      for (const cid of classroomIds) {
        const roomPredicate =
          cid === null
            ? isNull(committeeSignups.classroomId)
            : eq(committeeSignups.classroomId, cid);

        const [{ activeInRoom }] = await tx
          .select({ activeInRoom: count() })
          .from(committeeSignups)
          .where(
            and(
              eq(committeeSignups.committeeId, committeeId),
              roomPredicate,
              eq(committeeSignups.status, "active")
            )
          );

        const seats = limit - activeInRoom;
        if (seats <= 0) continue;

        const roomQueue = await tx
          .select()
          .from(committeeSignups)
          .where(
            and(
              eq(committeeSignups.committeeId, committeeId),
              roomPredicate,
              eq(committeeSignups.status, "waitlisted"),
              ...(options?.signupId
                ? [eq(committeeSignups.id, options.signupId)]
                : [])
            )
          )
          .orderBy(sql`${committeeSignups.waitlistedAt} ASC NULLS LAST`)
          .limit(Math.min(seats, 1000));

        queue.push(...roomQueue);
      }
    } else {
      const [{ taken }] = await tx
        .select({ taken: count() })
        .from(committeeSignups)
        .where(
          and(
            eq(committeeSignups.committeeId, committeeId),
            eq(committeeSignups.status, "active")
          )
        );

      // An open committee has no wall, so every waitlist entry left over from a
      // previous `capped` configuration is promotable at once.
      const seats =
        committee.capacityMode === "capped" && committee.maxSize !== null
          ? committee.maxSize - taken
          : Number.MAX_SAFE_INTEGER;
      if (seats <= 0) return [];

      queue = await tx
        .select()
        .from(committeeSignups)
        .where(
          and(
            eq(committeeSignups.committeeId, committeeId),
            eq(committeeSignups.status, "waitlisted"),
            ...(options?.signupId ? [eq(committeeSignups.id, options.signupId)] : [])
          )
        )
        // Nulls last so a row missing its timestamp can never cut the line.
        .orderBy(sql`${committeeSignups.waitlistedAt} ASC NULLS LAST`)
        .limit(Math.min(seats, 1000));
    }

    if (queue.length === 0) return [];

    for (const row of queue) {
      await tx
        .update(committeeSignups)
        .set({ status: "active", waitlistedAt: null, promotedAt: now })
        .where(eq(committeeSignups.id, row.id));
    }

    return queue.map((row) => ({
      id: row.id,
      userId: row.userId,
      name: row.name,
      email: row.email,
      role: row.role as CommitteeRole,
      schoolId: row.schoolId,
      committeeName: committee.name,
    }));
  });

  // Access and email happen after the commit — a Resend outage must not roll
  // back a promotion that has already been decided.
  for (const person of promoted) {
    if (person.userId) {
      await ensureCommitteeMembership(person.userId, committeeId, person.role);
    }
    try {
      await sendCommitteePromotionEmail(person);
    } catch (error) {
      console.error("Failed to send committee promotion email:", error);
    }
  }

  return { promoted: promoted.length };
}

/** "A spot opened on the Yearbook Committee — you're in." */
async function sendCommitteePromotionEmail(person: {
  schoolId: string;
  name: string;
  email: string;
  committeeName: string;
}) {
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, person.schoolId),
    columns: { name: true },
  });

  await sendWelcomeEmail({
    email: person.email,
    name: person.name,
    schoolId: person.schoolId,
    schoolName: school?.name ?? "Your school",
    signups: [{ role: `${person.committeeName} member` }],
    listIntro: `A spot opened up and you're in! You're now on:`,
    benefits: [
      "The committee's message board",
      "Shared task lists so nothing falls through",
      "Contact info for the rest of the committee",
    ],
    callbackPath: "/committees",
  });
}

// ─── Waitlist Position ─────────────────────────────────────────────────────

/**
 * 1-based place in line. Ordered by `waitlistedAt`, never by `createdAt`.
 *
 * For a per-classroom committee (the row carries a `classroomId`) the line is
 * per classroom — "you're #1 for Room 12" — since a Room 8 vacancy will never
 * promote a Room 12 waitlister. A school-wide committee (null `classroomId`)
 * counts the whole committee.
 */
async function waitlistPositionWithin(
  tx: DbLike,
  row: { committeeId: string; waitlistedAt: Date | null; classroomId?: string | null }
): Promise<number> {
  if (!row.waitlistedAt) return 1;
  const [{ ahead }] = await tx
    .select({ ahead: count() })
    .from(committeeSignups)
    .where(
      and(
        eq(committeeSignups.committeeId, row.committeeId),
        eq(committeeSignups.status, "waitlisted"),
        lt(committeeSignups.waitlistedAt, row.waitlistedAt),
        ...(row.classroomId
          ? [eq(committeeSignups.classroomId, row.classroomId)]
          : [])
      )
    );
  return ahead + 1;
}

/** Public read of a waitlisted signup's place in line. */
export async function getCommitteeWaitlistPosition(
  signupId: string
): Promise<number | null> {
  const row = await db.query.committeeSignups.findFirst({
    where: eq(committeeSignups.id, signupId),
    columns: {
      committeeId: true,
      waitlistedAt: true,
      status: true,
      classroomId: true,
    },
  });
  if (!row || row.status !== "waitlisted") return null;
  return waitlistPositionWithin(db, row);
}

// ─── Open / Closed ─────────────────────────────────────────────────────────

/**
 * Whether a committee's join link should work right now. Shared by the capacity
 * transaction and the public reads so the join page and the write behind it
 * can't drift into disagreeing about whether recruiting is open.
 */
export function isCommitteeOpen(
  committee: Pick<
    CommitteeCapacityRow,
    "status" | "archivedAt" | "opensAt" | "closesAt"
  >,
  now: Date = new Date()
): boolean {
  if (committee.status !== "active") return false;
  if (committee.archivedAt) return false;
  if (committee.opensAt && committee.opensAt > now) return false;
  if (committee.closesAt && committee.closesAt < now) return false;
  return true;
}

// ─── Account Linking ───────────────────────────────────────────────────────

/**
 * Called from NextAuth `createUser` / `signIn`. Mirrors
 * `linkVolunteerSignupsToUser`.
 *
 * Waitlisted signups are linked and do grant school membership — they put their
 * hand up, they belong to the school — but produce no `committee_members` row,
 * so a waitlisted parent sees the committee listed as "You're #3 on the
 * waitlist" without reaching its message board.
 */
export async function linkCommitteeSignupsToUser(
  userId: string,
  email: string
): Promise<{ linked: number }> {
  const unlinked = await db.query.committeeSignups.findMany({
    where: and(
      eq(committeeSignups.email, email.toLowerCase()),
      isNull(committeeSignups.userId),
      or(
        eq(committeeSignups.status, "active"),
        eq(committeeSignups.status, "waitlisted")
      )
    ),
  });

  if (unlinked.length === 0) return { linked: 0 };

  const schoolIds = [...new Set(unlinked.map((s) => s.schoolId))];

  for (const schoolId of schoolIds) {
    // Join the school for ITS active year, not a global constant.
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
        approvedAt: new Date(),
      });
    }
  }

  for (const signup of unlinked) {
    await db
      .update(committeeSignups)
      .set({ userId })
      .where(eq(committeeSignups.id, signup.id));

    if (signup.status === "active") {
      await ensureCommitteeMembership(
        userId,
        signup.committeeId,
        signup.role as CommitteeRole
      );
    }
  }

  return { linked: unlinked.length };
}
