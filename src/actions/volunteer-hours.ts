"use server";

import {
  assertAuthenticated,
  assertPtaBoardMember,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  classroomMembers,
  classrooms,
  eventCatalog,
  schoolMemberships,
  schools,
  volunteerHours,
  volunteerSignups,
} from "@/lib/db/schema";
import { eq, and, asc, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notify } from "@/lib/notify";
import { getMyCommitteeOptions } from "@/actions/committees";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { pendingHoursFilter } from "@/lib/volunteer-hours-queue";
import {
  findUserByEmail,
  searchVolunteerCandidates,
  type VolunteerCandidate,
} from "@/lib/volunteer-hours-entry";
import {
  linkExistingAccountToSchool,
  sendWelcomeEmail,
} from "@/lib/volunteer-onboarding";
import { isValidEmail } from "@/lib/utils";
import {
  COMMITTEE_CATEGORY,
  EMPTY_ACTIVITY_OPTIONS,
  ROOM_PARENT_CATEGORY,
  isKnownVolunteerCategory,
  roomParentActivityLabel,
  suggestedCategoryForEventCategory,
  type VolunteerActivityOptions,
} from "@/lib/volunteer-activities-shared";

/**
 * Everything the caller could plausibly be logging hours against.
 *
 * Only the caller's own classrooms and committees are offered, so the picker
 * can't be read as a roster of who is on what. The event catalog is school-wide
 * on purpose — anyone can turn up to help at the Fall Festival without being
 * signed up for it, and that hour still counts.
 */
export async function getVolunteerHourActivityOptions(): Promise<VolunteerActivityOptions> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return EMPTY_ACTIVITY_OPTIONS;
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const [events, memberRooms, signupRooms, myCommittees] = await Promise.all([
    db.query.eventCatalog.findMany({
      where: and(
        eq(eventCatalog.schoolId, schoolId),
        eq(eventCatalog.isActive, true)
      ),
      columns: { id: true, title: true, category: true },
      orderBy: [asc(eventCatalog.title)],
    }),
    // Room parenthood is recorded in two places — an explicit classroom_members
    // row, or an active volunteer signup — and either one is the real thing.
    db
      .select({ id: classrooms.id, name: classrooms.name })
      .from(classroomMembers)
      .innerJoin(classrooms, eq(classrooms.id, classroomMembers.classroomId))
      .where(
        and(
          eq(classroomMembers.userId, user.id!),
          eq(classroomMembers.role, "room_parent"),
          eq(classrooms.schoolId, schoolId),
          eq(classrooms.schoolYear, schoolYear)
        )
      ),
    db
      .select({ id: classrooms.id, name: classrooms.name })
      .from(volunteerSignups)
      .innerJoin(classrooms, eq(classrooms.id, volunteerSignups.classroomId))
      .where(
        and(
          eq(volunteerSignups.userId, user.id!),
          eq(volunteerSignups.role, "room_parent"),
          eq(volunteerSignups.status, "active"),
          eq(volunteerSignups.schoolId, schoolId),
          eq(classrooms.schoolYear, schoolYear)
        )
      ),
    getMyCommitteeOptions(),
  ]);

  // Both room-parent sources can name the same room; dedupe by classroom.
  const rooms = new Map<string, string>();
  for (const room of [...memberRooms, ...signupRooms]) {
    rooms.set(room.id, room.name);
  }

  return {
    events: events.map((e) => ({
      value: e.title,
      label: e.title,
      suggestedCategory: suggestedCategoryForEventCategory(e.category),
    })),
    classrooms: [...rooms.values()]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        value: roomParentActivityLabel(name),
        label: roomParentActivityLabel(name),
        suggestedCategory: ROOM_PARENT_CATEGORY,
      })),
    committees: myCommittees.map((c) => ({
      id: c.id,
      value: c.name,
      label: c.name,
      suggestedCategory: COMMITTEE_CATEGORY,
    })),
  };
}

export async function logVolunteerHours(data: {
  eventName: string;
  hours: string;
  date: string;
  category: string;
  notes?: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // The picker can't produce a blank, but "Other" can — it's a text box.
  const eventName = data.eventName.trim();
  if (!eventName) throw new Error("Say what these hours were for");

  await db.insert(volunteerHours).values({
    schoolId,
    userId: user.id!,
    eventName,
    hours: data.hours,
    date: data.date,
    category: data.category,
    notes: data.notes || null,
    approved: false,
  });

  revalidatePath("/volunteer-hours");
}

// ─── Entering Someone Else's Hours ──────────────────────────────────────────
//
// Most PTAs still collect hours on a sheet of paper passed round the monthly
// meeting. Somebody types it up afterwards, and the names on it are a mix of
// three kinds of person: parents who already have an account, parents who
// don't but whose email the board knows, and parents who are just a name in
// biro. All three have to land, or the sheet stops being transcribable at the
// first name that doesn't fit — which in practice means it never gets typed up
// at all.

export interface RecordHoursInput {
  /** Set when the board picked somebody who already has an account. */
  userId?: string | null;
  /** Who these hours belong to. Required — a row with no name names nobody. */
  name: string;
  /** Optional, deliberately. The board often knows a name and no address. */
  email?: string | null;
  eventName: string;
  hours: string;
  date: string;
  category?: string | null;
  notes?: string | null;
  /**
   * Whether to approve on entry. Default is that a board member typing up the
   * official sheet has already done the reviewing the queue exists for.
   */
  approved?: boolean;
  /** Email a new volunteer a sign-in link. Ignored when there's no address. */
  invite?: boolean;
}

export interface RecordHoursResult {
  id: string;
  /** How the entry will read back on every surface. */
  volunteerName: string;
  volunteerEmail: string | null;
  eventName: string;
  hours: string;
  date: string;
  approved: boolean;
  /** True when the hours went onto an existing DragonHub account. */
  linked: boolean;
  /** True when a sign-in link was actually sent. */
  invited: boolean;
  /**
   * Set when there's no address at all: the entry is a complete record of the
   * work and still nobody can sign in to see it. Surfaced so the form can say
   * so rather than implying an invitation went out.
   */
  warning?: string;
}

/** Who the hours on the sheet could belong to. Board-only — it names people. */
export async function searchVolunteers(
  query: string
): Promise<VolunteerCandidate[]> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return [];
  await assertPtaBoardMember(user.id!, schoolId);
  return searchVolunteerCandidates(schoolId, query);
}

/**
 * Record hours somebody else did.
 *
 * The three cases, and what separates them:
 *
 *  - **An account**, picked from the search. The entry is theirs immediately —
 *    it shows on their own page, counts on the leaderboard, and they're told.
 *  - **An address with no account.** The row is written against the name and
 *    the address, and `linkVolunteerHoursToUser` claims it the moment they sign
 *    in. The invitation is a magic link, so accepting it *is* joining the
 *    school; nothing is created for them in the meantime.
 *  - **A name alone.** A complete record of work done, and the end of it. It
 *    grants nothing and can never be claimed, because a name is not a claim to
 *    an address — the form says as much, and so does the result.
 */
export async function recordHoursForVolunteer(
  data: RecordHoursInput
): Promise<RecordHoursResult> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const name = data.name.trim();
  if (!name) throw new Error("Whose hours are these?");

  const eventName = data.eventName.trim();
  if (!eventName) throw new Error("Say what these hours were for");

  const hours = Number(data.hours);
  // decimal(5,2) — anything larger is a typo, and a negative entry is a way to
  // quietly subtract from a total nobody is watching.
  if (!Number.isFinite(hours) || hours <= 0 || hours > 999.99) {
    throw new Error("Enter the hours as a number between 0.25 and 999.99");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    throw new Error("Enter the date these hours were worked");
  }

  const email = data.email?.trim().toLowerCase() || null;
  if (email && !isValidEmail(email)) {
    throw new Error("That email address doesn't look right");
  }

  // Narrowed here and not only in the form: the field takes a string, and a
  // category the pickers have never heard of files the row out of every filter.
  const category =
    data.category && isKnownVolunteerCategory(data.category)
      ? data.category
      : null;

  const schoolYear = await getSchoolCurrentYear(schoolId);

  // ── Resolve who this is ───────────────────────────────────────────────────
  let userId = data.userId ?? null;
  let invited = false;

  if (userId) {
    // A user id arrives from the client, so it is a request, not a fact. Hours
    // may only be recorded against somebody this school has admitted.
    const membership = await db.query.schoolMemberships.findFirst({
      where: and(
        eq(schoolMemberships.userId, userId),
        eq(schoolMemberships.schoolId, schoolId)
      ),
      columns: { id: true },
    });
    if (!membership) {
      throw new Error("That person isn't a member of this school");
    }
  } else if (email) {
    const existing = await findUserByEmail(email);
    if (existing) {
      // They have an account but weren't picked from the search — a board
      // member typing an address they know. Attach it to the school for this
      // year, exactly as a signup would, and the entry is theirs.
      await linkExistingAccountToSchool(email, schoolId, schoolYear, "admin_add");
      userId = existing.id;
    }
  }

  const [entry] = await db
    .insert(volunteerHours)
    .values({
      schoolId,
      userId,
      // The account is the identity wherever there is one; carrying a second
      // copy of the name beside it is how the two drift apart.
      volunteerName: userId ? null : name,
      volunteerEmail: userId ? null : email,
      loggedBy: user.id!,
      eventName,
      hours: hours.toFixed(2),
      date: data.date,
      category,
      notes: data.notes?.trim() || null,
      approved: data.approved !== false,
      approvedBy: data.approved !== false ? user.id! : null,
    })
    .returning({ id: volunteerHours.id });

  // ── Tell them ─────────────────────────────────────────────────────────────
  if (userId && userId !== user.id) {
    const recipient = userId;
    after(() =>
      notify({
        type: "hours_approved",
        schoolId,
        recipients: [recipient],
        actorId: user.id!,
        title: "Volunteer hours were added for you",
        body: `${formatHours(hours)} hour${hours === 1 ? "" : "s"} for ${eventName}.`,
        url: "/volunteer-hours",
        // A sitting spent typing up the sheet can add three entries for the
        // same parent. One inbox row saying so beats three.
        groupKey: `hours_recorded:${schoolId}`,
      })
    );
  }

  // The invitation is only ever sent to somebody who has no account: it is a
  // welcome, and welcoming an existing member to a school they've been at all
  // year reads as a mistake.
  if (!userId && email && data.invite !== false) {
    const school = await db.query.schools.findFirst({
      where: eq(schools.id, schoolId),
      columns: { name: true },
    });
    try {
      await sendWelcomeEmail({
        email,
        name,
        schoolId,
        schoolName: school?.name ?? "your school",
        listIntro: "Your volunteer hours have been recorded:",
        signups: [{ role: `${formatHours(hours)} hours`, classroomName: eventName }],
        benefits: [
          "Your own record of every hour you've volunteered",
          "The school calendar, budget and fundraiser progress",
          "Everything the PTA is planning this year",
        ],
        callbackPath: "/volunteer-hours",
      });
      invited = true;
    } catch (error) {
      // The hours are recorded either way. An invitation that didn't send is
      // worth saying out loud, not worth losing the entry over.
      console.error("Failed to send volunteer hours invitation:", error);
    }
  }

  revalidatePath("/admin/volunteer-hours");
  revalidatePath("/volunteer-hours");

  return {
    id: entry.id,
    volunteerName: name,
    volunteerEmail: email,
    eventName,
    hours: formatHours(hours),
    date: data.date,
    approved: data.approved !== false,
    linked: !!userId,
    invited,
    warning:
      !userId && !email
        ? `${name}'s hours are recorded, but without an email address they can't sign in to DragonHub. Add one later and they'll be linked automatically.`
        : !userId && email && !invited
          ? "The hours are recorded, but the sign-in email couldn't be sent."
          : undefined,
  };
}

/**
 * Take back an entry you just made.
 *
 * Scoped to rows this board member entered themselves and that nobody has
 * claimed since, because it is an undo for a slip in a transcription sitting —
 * a typo in the hours, the wrong name off the sheet — and not a second way to
 * delete a parent's own submission. `rejectHours` is that, and it tells them.
 */
export async function undoRecordedHours(
  hourId: string
): Promise<{ removed: boolean }> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const removed = await db
    .delete(volunteerHours)
    .where(
      and(
        eq(volunteerHours.id, hourId),
        eq(volunteerHours.schoolId, schoolId),
        eq(volunteerHours.loggedBy, user.id!),
        // "Nobody has claimed it since" is exactly this shape. A row entered
        // against an account carries no `volunteerEmail` — the account is the
        // identity — while `linkVolunteerHoursToUser` sets `userId` on a guest
        // row and leaves the typed address in place. So the two together mean
        // the volunteer has signed in and these hours are now on their own
        // page; deleting them there would be silent, and is `rejectHours`'
        // job, which tells them.
        or(isNull(volunteerHours.userId), isNull(volunteerHours.volunteerEmail))
      )
    )
    .returning({ id: volunteerHours.id });

  revalidatePath("/admin/volunteer-hours");
  revalidatePath("/volunteer-hours");

  return { removed: removed.length > 0 };
}

export async function approveHours(hourId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Only approve hours for current school
  const [approved] = await db
    .update(volunteerHours)
    .set({ approved: true, approvedBy: user.id! })
    .where(and(eq(volunteerHours.id, hourId), eq(volunteerHours.schoolId, schoolId)))
    .returning({
      userId: volunteerHours.userId,
      eventName: volunteerHours.eventName,
      hours: volunteerHours.hours,
    });

  if (approved) {
    after(() =>
      notify({
        type: "hours_approved",
        schoolId,
        recipients: [approved.userId],
        actorId: user.id!,
        title: "Your volunteer hours were approved",
        body: `${approved.hours} hour${Number(approved.hours) === 1 ? "" : "s"} for ${approved.eventName}.`,
        url: "/volunteer-hours",
      })
    );
  }

  revalidatePath("/admin/volunteer-hours");
  revalidatePath("/volunteer-hours");
}

/**
 * Approve everything still pending for this school, in one press.
 *
 * The board's reality is a stack of twenty entries logged the week after the
 * Fall Festival, all of them obviously fine, reviewed by one person on a phone.
 * Approving them one at a time is twenty round trips and twenty pushes.
 *
 * One UPDATE, scoped to the school and using the same predicate the queue is
 * listed with, then **one notification per volunteer** rather than one per row:
 * a parent who logged four shifts gets a single "4 entries approved", which is
 * both what they want to read and the difference between this feature and a
 * reason to turn notifications off.
 *
 * Returns how many rows it approved so the caller can say so — zero is a
 * legitimate answer when someone else cleared the queue first.
 */
export async function approveAllPendingHours(): Promise<{ approved: number }> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const approved = await db
    .update(volunteerHours)
    .set({ approved: true, approvedBy: user.id! })
    .where(pendingHoursFilter(schoolId))
    .returning({
      userId: volunteerHours.userId,
      hours: volunteerHours.hours,
    });

  if (approved.length > 0) {
    const perVolunteer = new Map<string, { entries: number; hours: number }>();
    for (const row of approved) {
      // Rows the board entered for a volunteer with no account are approved
      // like any other; there is simply nobody to tell.
      if (!row.userId) continue;
      const tally = perVolunteer.get(row.userId) ?? { entries: 0, hours: 0 };
      tally.entries += 1;
      tally.hours += Number(row.hours) || 0;
      perVolunteer.set(row.userId, tally);
    }

    after(async () => {
      for (const [userId, tally] of perVolunteer) {
        await notify({
          type: "hours_approved",
          schoolId,
          recipients: [userId],
          actorId: user.id!,
          title: "Your volunteer hours were approved",
          body:
            tally.entries === 1
              ? `${formatHours(tally.hours)} hour${tally.hours === 1 ? "" : "s"} approved.`
              : `${tally.entries} entries totalling ${formatHours(tally.hours)} hours approved.`,
          url: "/volunteer-hours",
        });
      }
    });
  }

  revalidatePath("/admin/volunteer-hours");
  revalidatePath("/volunteer-hours");

  return { approved: approved.length };
}

/** "3", "3.5" — never "3.0", and never a float's tail. */
function formatHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
}

export async function rejectHours(hourId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Only delete hours for current school.
  //
  // Rejection deletes the row, so the notification has to be built from the
  // RETURNING clause — after this statement there is nothing left to describe
  // the entry the parent submitted, and "your hours were returned" with no
  // mention of which hours is useless.
  const [rejected] = await db
    .delete(volunteerHours)
    .where(and(eq(volunteerHours.id, hourId), eq(volunteerHours.schoolId, schoolId)))
    .returning({
      userId: volunteerHours.userId,
      eventName: volunteerHours.eventName,
      hours: volunteerHours.hours,
    });

  if (rejected) {
    after(() =>
      notify({
        type: "hours_approved",
        schoolId,
        recipients: [rejected.userId],
        actorId: user.id!,
        title: "Your volunteer hours were returned",
        body: `${rejected.hours} hour${Number(rejected.hours) === 1 ? "" : "s"} for ${rejected.eventName} — check with the board and log them again if this looks wrong.`,
        url: "/volunteer-hours",
      })
    );
  }

  revalidatePath("/admin/volunteer-hours");
  revalidatePath("/volunteer-hours");
}
