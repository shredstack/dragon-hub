"use server";

/**
 * Committees — the general-purpose sibling of a classroom's room parent group.
 *
 * Board configuration, the member-facing workspace, and the public join flow all
 * live here. Every write that decides who holds a seat goes through
 * `recordCommitteeSignup` / `deactivateCommitteeSignup` in
 * [committee-onboarding.ts](src/lib/committee-onboarding.ts) rather than
 * touching `committee_signups` directly, so capacity and the waitlist stay
 * correct no matter which door someone came in by.
 */

import {
  assertAuthenticated,
  assertCommitteeAccess,
  assertCommitteeChair,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  classrooms,
  committeeMembers,
  committeeMessages,
  committees,
  committeeScheduleSlots,
  committeeSignups,
  committeeTasks,
  eventPlans,
  schools,
  users,
} from "@/lib/db/schema";
import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import QRCode from "qrcode";
import { getAppBaseUrl } from "@/lib/magic-link";
import {
  linkExistingAccountToSchool,
  normalizeContact,
  sendWelcomeEmail,
} from "@/lib/volunteer-onboarding";
import { copyCommitteesToYear } from "@/lib/committee-rollover";
import {
  deactivateCommitteeSignup,
  isCommitteeOpen,
  promoteFromCommitteeWaitlist,
  recordCommitteeSignup,
  syncCommitteeMembership,
  type CommitteeRole,
} from "@/lib/committee-onboarding";
import {
  resolveVolunteerEligibility,
  type VolunteerEligibilityInfo,
} from "@/lib/volunteer-eligibility";
import { formatPhoneNumber } from "@/lib/utils";
import { toCsv } from "@/lib/csv";
import { assertNoHistory, summarizeHistory } from "@/lib/history-guard";

export type CommitteeScope =
  | "school"
  | "classroom"
  | "event_plan"
  /** Needs `perClassroomLimit` volunteers in every active classroom (MTM). */
  | "all_classrooms";
export type CommitteeStatus = "draft" | "active" | "closed";
export type CapacityMode = "open" | "capped";

// ─── Authorization ─────────────────────────────────────────────────────────

/**
 * Committees are configured by whichever board member owns the job, so this is
 * board-wide rather than scoped to a position — consistent with the rest of the
 * app today. Returns the acting user and school so callers don't repeat it.
 */
async function assertCommitteeManager() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);
  return { userId: user.id!, schoolId };
}

/** Loads a committee, failing if it belongs to another school. */
async function assertCommitteeInSchool(committeeId: string, schoolId: string) {
  const committee = await db.query.committees.findFirst({
    where: and(
      eq(committees.id, committeeId),
      eq(committees.schoolId, schoolId)
    ),
  });
  if (!committee) throw new Error("Committee not found");
  return committee;
}

/** Resolves a signup to its committee, failing across school boundaries. */
async function assertSignupInSchool(signupId: string, schoolId: string) {
  const signup = await db.query.committeeSignups.findFirst({
    where: and(
      eq(committeeSignups.id, signupId),
      eq(committeeSignups.schoolId, schoolId)
    ),
  });
  if (!signup) throw new Error("Signup not found");
  return signup;
}

async function revalidateCommittee(committeeId: string, joinCode?: string) {
  revalidatePath("/admin/committees");
  revalidatePath(`/admin/committees/${committeeId}`);
  revalidatePath("/committees");
  revalidatePath(`/committees/${committeeId}`);
  if (joinCode) revalidatePath(`/committee/${joinCode}`);
}

// ─── Board Configuration ───────────────────────────────────────────────────

export interface CommitteeInput {
  name: string;
  description?: string | null;
  responsibilities?: string | null;
  typicalTiming?: string | null;
  timeCommitment?: string | null;
  iconEmoji?: string | null;
  imageUrl?: string | null;
  scope?: CommitteeScope;
  classroomId?: string | null;
  eventPlanId?: string | null;
  grantsLinkedAccess?: boolean;
  showOnRoomParentSignup?: boolean;
  showPerClassroomOnSignup?: boolean;
  perClassroomLimit?: number | null;
  schedulingEnabled?: boolean;
  capacityMode?: CapacityMode;
  minSize?: number | null;
  maxSize?: number | null;
  waitlistEnabled?: boolean;
  opensAt?: string | null;
  closesAt?: string | null;
  ownerPosition?: string | null;
  contactEmail?: string | null;
  status?: CommitteeStatus;
}

/**
 * Normalizes the scope triple into the exact shape `committees_scope_target_check`
 * allows, so a bad combination is rejected here with a readable message rather
 * than surfacing as a constraint violation.
 */
function resolveScope(data: {
  scope?: CommitteeScope;
  classroomId?: string | null;
  eventPlanId?: string | null;
}): { scope: CommitteeScope; classroomId: string | null; eventPlanId: string | null } {
  const scope = data.scope ?? "school";
  if (scope === "classroom") {
    if (!data.classroomId) throw new Error("Pick the classroom this committee belongs to.");
    return { scope, classroomId: data.classroomId, eventPlanId: null };
  }
  if (scope === "event_plan") {
    if (!data.eventPlanId) throw new Error("Pick the event plan this committee belongs to.");
    return { scope, classroomId: null, eventPlanId: data.eventPlanId };
  }
  // `all_classrooms` deliberately takes no target: it applies to every active
  // classroom, so there is nothing to pick. `perClassroomLimit` is its config.
  if (scope === "all_classrooms") {
    return { scope, classroomId: null, eventPlanId: null };
  }
  return { scope: "school", classroomId: null, eventPlanId: null };
}

/** Mirrors `committees_capacity_check` with a message a board member can act on. */
function resolveCapacity(data: {
  capacityMode?: CapacityMode;
  minSize?: number | null;
  maxSize?: number | null;
}) {
  const capacityMode = data.capacityMode ?? "open";
  const maxSize = data.maxSize ?? null;
  if (capacityMode === "capped" && (maxSize === null || maxSize <= 0)) {
    throw new Error(
      "A committee with a limit needs a maximum size. Choose 'Open to anyone' if there's no limit."
    );
  }
  return {
    capacityMode,
    minSize: data.minSize ?? null,
    // A cap on an open committee is noise that would confuse the next editor.
    maxSize: capacityMode === "capped" ? maxSize : null,
  };
}

/**
 * Derives the room-parent-page placement and per-classroom staffing from the
 * committee's KIND, which is the only thing that makes either meaningful:
 *
 * - `all_classrooms` — needs `perClassroomLimit` volunteers in every active
 *   classroom, and may be offered under each classroom on the signup page.
 * - `school` — may ride the signup page as a flat checklist (Yearbook).
 * - `classroom` / `event_plan` — neither; the signup page is organised by
 *   classroom and a single-room or event-plan committee has no place on it.
 *
 * Deriving rather than trusting the two booleans independently is what keeps
 * `committees_signup_placement_check` satisfiable and stops a committee being
 * configured for a kind it isn't.
 */
function resolvePlacement(
  data: {
    showOnRoomParentSignup?: boolean;
    showPerClassroomOnSignup?: boolean;
    perClassroomLimit?: number | null;
  },
  scope: CommitteeScope
) {
  if (scope === "all_classrooms") {
    const limit = data.perClassroomLimit ?? null;
    if (limit === null || limit <= 0) {
      throw new Error(
        "Set how many volunteers each classroom needs (at least 1)."
      );
    }
    return {
      showOnRoomParentSignup: false,
      showPerClassroomOnSignup: data.showPerClassroomOnSignup ?? false,
      perClassroomLimit: limit,
    };
  }
  if (scope === "school") {
    return {
      showOnRoomParentSignup: data.showOnRoomParentSignup ?? false,
      showPerClassroomOnSignup: false,
      perClassroomLimit: null,
    };
  }
  return {
    showOnRoomParentSignup: false,
    showPerClassroomOnSignup: false,
    perClassroomLimit: null,
  };
}

/**
 * Verifies a scope target belongs to this school. The ids come from a form, and
 * a hand-crafted submit must not be able to attach a committee to another
 * school's classroom (and, with `grantsLinkedAccess`, hand out access to it).
 */
async function assertScopeTargetInSchool(
  schoolId: string,
  target: { classroomId: string | null; eventPlanId: string | null }
) {
  if (target.classroomId) {
    const classroom = await db.query.classrooms.findFirst({
      where: and(
        eq(classrooms.id, target.classroomId),
        eq(classrooms.schoolId, schoolId)
      ),
      columns: { id: true },
    });
    if (!classroom) throw new Error("Classroom not found");
  }
  if (target.eventPlanId) {
    const plan = await db.query.eventPlans.findFirst({
      where: and(
        eq(eventPlans.id, target.eventPlanId),
        eq(eventPlans.schoolId, schoolId)
      ),
      columns: { id: true },
    });
    if (!plan) throw new Error("Event plan not found");
  }
}

export async function createCommittee(data: CommitteeInput) {
  const { userId, schoolId } = await assertCommitteeManager();
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const name = data.name.trim();
  if (!name) throw new Error("Please give the committee a name.");

  const scope = resolveScope(data);
  await assertScopeTargetInSchool(schoolId, scope);
  const capacity = resolveCapacity(data);
  const placement = resolvePlacement(data, scope.scope);

  const [committee] = await db
    .insert(committees)
    .values({
      schoolId,
      schoolYear,
      name,
      description: data.description?.trim() || null,
      responsibilities: data.responsibilities?.trim() || null,
      typicalTiming: data.typicalTiming?.trim() || null,
      timeCommitment: data.timeCommitment?.trim() || null,
      iconEmoji: data.iconEmoji?.trim() || null,
      imageUrl: data.imageUrl?.trim() || null,
      ...scope,
      grantsLinkedAccess: data.grantsLinkedAccess ?? false,
      joinCode: nanoid(12),
      ...placement,
      schedulingEnabled: data.schedulingEnabled ?? false,
      ...capacity,
      waitlistEnabled: data.waitlistEnabled ?? true,
      opensAt: data.opensAt ? new Date(data.opensAt) : null,
      closesAt: data.closesAt ? new Date(data.closesAt) : null,
      ownerPosition: (data.ownerPosition as never) || null,
      contactEmail: data.contactEmail?.trim().toLowerCase() || null,
      status: data.status ?? "draft",
      createdBy: userId,
    })
    .returning();

  // A brand-new committee starts its own lineage — the "same committee, year
  // after year" identity that `promoteCommitteesToYear` carries forward.
  await db
    .update(committees)
    .set({ lineageId: committee.id })
    .where(eq(committees.id, committee.id));

  await revalidateCommittee(committee.id, committee.joinCode);
  return { ...committee, lineageId: committee.id };
}

export async function updateCommittee(committeeId: string, data: CommitteeInput) {
  const { schoolId } = await assertCommitteeManager();
  const existing = await assertCommitteeInSchool(committeeId, schoolId);

  const capacity = resolveCapacity({
    capacityMode: data.capacityMode ?? (existing.capacityMode as CapacityMode),
    minSize: data.minSize !== undefined ? data.minSize : existing.minSize,
    maxSize: data.maxSize !== undefined ? data.maxSize : existing.maxSize,
  });

  // Placement and per-classroom staffing both follow from the committee's kind,
  // so recompute from the merged state rather than patching a field in
  // isolation. `data.scope` carries the kind the board just chose — the edit
  // form calls this before `setCommitteeScope` writes the column — so a
  // committee switched to (or away from) "every classroom" lands consistent.
  const effectiveScope = data.scope ?? (existing.scope as CommitteeScope);
  const placement = resolvePlacement(
    {
      showOnRoomParentSignup:
        data.showOnRoomParentSignup ?? existing.showOnRoomParentSignup,
      showPerClassroomOnSignup:
        data.showPerClassroomOnSignup ?? existing.showPerClassroomOnSignup,
      perClassroomLimit:
        data.perClassroomLimit !== undefined
          ? data.perClassroomLimit
          : existing.perClassroomLimit,
    },
    effectiveScope
  );

  // Lowering a cap below the current headcount would mean evicting people who
  // already hold seats, which no automated rule should decide.
  const [{ seated }] = await db
    .select({ seated: count() })
    .from(committeeSignups)
    .where(
      and(
        eq(committeeSignups.committeeId, committeeId),
        eq(committeeSignups.status, "active")
      )
    );
  if (
    capacity.capacityMode === "capped" &&
    capacity.maxSize !== null &&
    capacity.maxSize < seated
  ) {
    throw new Error(
      `${seated} ${seated === 1 ? "person is" : "people are"} already on this committee. Remove someone first, or set the limit to at least ${seated}.`
    );
  }

  await db
    .update(committees)
    .set({
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.description !== undefined && {
        description: data.description?.trim() || null,
      }),
      ...(data.responsibilities !== undefined && {
        responsibilities: data.responsibilities?.trim() || null,
      }),
      ...(data.typicalTiming !== undefined && {
        typicalTiming: data.typicalTiming?.trim() || null,
      }),
      ...(data.timeCommitment !== undefined && {
        timeCommitment: data.timeCommitment?.trim() || null,
      }),
      ...(data.iconEmoji !== undefined && {
        iconEmoji: data.iconEmoji?.trim() || null,
      }),
      ...(data.imageUrl !== undefined && {
        imageUrl: data.imageUrl?.trim() || null,
      }),
      ...(data.grantsLinkedAccess !== undefined && {
        grantsLinkedAccess: data.grantsLinkedAccess,
      }),
      ...placement,
      ...(data.schedulingEnabled !== undefined && {
        schedulingEnabled: data.schedulingEnabled,
      }),
      ...capacity,
      ...(data.waitlistEnabled !== undefined && {
        waitlistEnabled: data.waitlistEnabled,
      }),
      ...(data.opensAt !== undefined && {
        opensAt: data.opensAt ? new Date(data.opensAt) : null,
      }),
      ...(data.closesAt !== undefined && {
        closesAt: data.closesAt ? new Date(data.closesAt) : null,
      }),
      ...(data.ownerPosition !== undefined && {
        ownerPosition: (data.ownerPosition as never) || null,
      }),
      ...(data.contactEmail !== undefined && {
        contactEmail: data.contactEmail?.trim().toLowerCase() || null,
      }),
      ...(data.status !== undefined && { status: data.status }),
      updatedAt: new Date(),
    })
    .where(eq(committees.id, committeeId));

  // Three new seats should fill themselves rather than wait for someone to
  // notice. Switching capped → open opens every seat at once, so the same call
  // drains the whole waitlist.
  const capacityLoosened =
    capacity.capacityMode === "open" ||
    (capacity.maxSize ?? 0) > (existing.maxSize ?? 0);
  // Raising how many each classroom needs should fill the newly-opened room
  // seats, whether or not the committee rides the signup page.
  const perClassroomRaised =
    (placement.perClassroomLimit ?? 0) > (existing.perClassroomLimit ?? 0);
  if (capacityLoosened || perClassroomRaised) {
    await promoteFromCommitteeWaitlist(committeeId);
  }

  await revalidateCommittee(committeeId, existing.joinCode);
  revalidatePath("/volunteer-signup", "layout");
}

/**
 * Attach or detach a classroom / event plan after creation, so a committee that
 * turns out to be running Field Day can be linked to that plan without being
 * recreated.
 *
 * Detaching never revokes access already granted through `grantsLinkedAccess` —
 * see `syncCommitteeMembership`.
 */
export async function setCommitteeScope(
  committeeId: string,
  data: { scope: CommitteeScope; classroomId?: string | null; eventPlanId?: string | null }
) {
  const { schoolId } = await assertCommitteeManager();
  const existing = await assertCommitteeInSchool(committeeId, schoolId);

  const scope = resolveScope(data);
  await assertScopeTargetInSchool(schoolId, scope);

  await db
    .update(committees)
    .set({ ...scope, updatedAt: new Date() })
    .where(eq(committees.id, committeeId));

  await revalidateCommittee(committeeId, existing.joinCode);
}

/**
 * Count what a permanent delete would take with it. Signups, messages and tasks
 * all cascade off `committees`, so they die with the row whether or not
 * anything removes them explicitly.
 */
export async function getCommitteeHistoryCounts(committeeId: string) {
  const { schoolId } = await assertCommitteeManager();
  await assertCommitteeInSchool(committeeId, schoolId);

  const [signups, messages, tasks] = await Promise.all([
    db.$count(committeeSignups, eq(committeeSignups.committeeId, committeeId)),
    db.$count(committeeMessages, eq(committeeMessages.committeeId, committeeId)),
    db.$count(committeeTasks, eq(committeeTasks.committeeId, committeeId)),
  ]);

  return summarizeHistory([
    { label: "volunteer signup", count: signups },
    { label: "message", count: messages },
    { label: "task", count: tasks },
  ]);
}

/** Soft delete. The roster, message board and task list are preserved. */
export async function archiveCommittee(committeeId: string) {
  const { schoolId, userId } = await assertCommitteeManager();
  const existing = await assertCommitteeInSchool(committeeId, schoolId);

  await db
    .update(committees)
    .set({
      archivedAt: new Date(),
      archivedBy: userId,
      status: "closed",
      updatedAt: new Date(),
    })
    .where(eq(committees.id, committeeId));

  await revalidateCommittee(committeeId, existing.joinCode);
}

export async function restoreCommittee(committeeId: string) {
  const { schoolId } = await assertCommitteeManager();
  const existing = await assertCommitteeInSchool(committeeId, schoolId);

  await db
    .update(committees)
    .set({ archivedAt: null, archivedBy: null, updatedAt: new Date() })
    .where(eq(committees.id, committeeId));

  await revalidateCommittee(committeeId, existing.joinCode);
}

/** Only allowed while nobody has signed up. Anything else archives instead. */
export async function deleteCommitteePermanently(committeeId: string) {
  const { schoolId } = await assertCommitteeManager();
  const committee = await assertCommitteeInSchool(committeeId, schoolId);

  const [signups, messages, tasks] = await Promise.all([
    db.$count(committeeSignups, eq(committeeSignups.committeeId, committeeId)),
    db.$count(committeeMessages, eq(committeeMessages.committeeId, committeeId)),
    db.$count(committeeTasks, eq(committeeTasks.committeeId, committeeId)),
  ]);
  assertNoHistory(
    committee.name,
    [
      { label: "volunteer signup", count: signups },
      { label: "message", count: messages },
      { label: "task", count: tasks },
    ],
    "Archive it instead — that retires the committee and its join link without losing who signed up."
  );

  await db.delete(committees).where(eq(committees.id, committeeId));
  revalidatePath("/admin/committees");
  revalidatePath("/committees");
}

/** Invalidates the old join link — any printed QR code stops working. */
export async function regenerateCommitteeJoinCode(committeeId: string) {
  const { schoolId } = await assertCommitteeManager();
  const existing = await assertCommitteeInSchool(committeeId, schoolId);

  const joinCode = nanoid(12);
  await db
    .update(committees)
    .set({ joinCode, updatedAt: new Date() })
    .where(eq(committees.id, committeeId));

  await revalidateCommittee(committeeId, existing.joinCode);
  revalidatePath(`/committee/${joinCode}`);
  return { joinCode };
}

// ─── Roster Management ─────────────────────────────────────────────────────

export interface ManualCommitteeMember {
  name: string;
  email: string;
  phone?: string;
  role?: CommitteeRole;
  notes?: string;
  /**
   * The room this volunteer covers, for an "every classroom" committee (MTM).
   * Required for that kind — a seat with no room counts against nothing and is
   * invisible on the coverage view. Ignored for every other scope.
   */
  classroomId?: string | null;
}

/**
 * Board or chair enters someone from a paper form.
 *
 * Bypasses the cap and the open/closed window — a board member adding a name
 * knows what they're doing, and seeding a draft committee with its chair is the
 * first thing they'll want to do. The confirmation dialog says so.
 */
export async function addCommitteeMemberManually(
  committeeId: string,
  data: ManualCommitteeMember
): Promise<{ success: boolean; error?: string; overCapacity?: boolean }> {
  const user = await assertAuthenticated();
  const access = await assertCommitteeChair(user.id!, committeeId);

  const committee = await assertCommitteeInSchool(committeeId, access.schoolId);

  const validation = normalizeContact(data);
  if (!validation.ok) return { success: false, error: validation.error };
  const contact = validation.contact;

  // Only an "every classroom" committee has a per-room meaning. Resolve the
  // room here rather than trusting the id off the form — a stale tab must not
  // seat someone in another school's classroom.
  let classroomId: string | null = null;
  if (committee.scope === "all_classrooms") {
    if (!data.classroomId) {
      return { success: false, error: "Pick the classroom they're covering." };
    }
    const classroom = await db.query.classrooms.findFirst({
      where: and(
        eq(classrooms.id, data.classroomId),
        eq(classrooms.schoolId, access.schoolId),
        eq(classrooms.schoolYear, committee.schoolYear)
      ),
      columns: { id: true },
    });
    if (!classroom) return { success: false, error: "Classroom not found." };
    classroomId = classroom.id;
  }

  const existingUser = await linkExistingAccountToSchool(
    contact.email,
    access.schoolId,
    committee.schoolYear
  );

  const result = await recordCommitteeSignup({
    schoolId: access.schoolId,
    committeeId,
    contact,
    classroomId,
    role: data.role ?? "member",
    notes: data.notes?.trim() || null,
    schoolYear: committee.schoolYear,
    signupSource: "manual",
    createdBy: user.id!,
    userId: existingUser?.id ?? null,
    bypassCapacity: true,
    allowClosed: true,
  });

  const [{ seated }] = await db
    .select({ seated: count() })
    .from(committeeSignups)
    .where(
      and(
        eq(committeeSignups.committeeId, committeeId),
        eq(committeeSignups.status, "active")
      )
    );

  // A per-classroom committee's cap is the room's, not the committee's — the
  // dialog warned about going past `perClassroomLimit`, so report against it.
  let overCapacity =
    committee.capacityMode === "capped" &&
    committee.maxSize !== null &&
    seated > committee.maxSize;
  if (classroomId && committee.perClassroomLimit !== null) {
    const [{ inRoom }] = await db
      .select({ inRoom: count() })
      .from(committeeSignups)
      .where(
        and(
          eq(committeeSignups.committeeId, committeeId),
          eq(committeeSignups.classroomId, classroomId),
          eq(committeeSignups.status, "active")
        )
      );
    overCapacity = overCapacity || inRoom > committee.perClassroomLimit;
  }

  await revalidateCommittee(committeeId, committee.joinCode);
  return {
    success: result.outcome !== "closed" && result.outcome !== "full",
    overCapacity,
  };
}

/** Chair or board. Backfills the vacancy from the waitlist. */
export async function removeCommitteeMember(signupId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const signup = await assertSignupInSchool(signupId, schoolId);
  await assertCommitteeChair(user.id!, signup.committeeId);

  await deactivateCommitteeSignup(
    {
      id: signup.id,
      committeeId: signup.committeeId,
      userId: signup.userId,
      classroomId: signup.classroomId,
    },
    user.id!
  );

  const committee = await assertCommitteeInSchool(signup.committeeId, schoolId);
  await revalidateCommittee(signup.committeeId, committee.joinCode);
}

/**
 * Promote someone out of order — typically a volunteer who ticked
 * `willingToChair` sitting at position 4 who shouldn't have to wait for three
 * people to drop.
 */
export async function promoteWaitlistedMember(signupId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const signup = await assertSignupInSchool(signupId, schoolId);
  await assertCommitteeChair(user.id!, signup.committeeId);

  const result = await promoteFromCommitteeWaitlist(signup.committeeId, {
    signupId,
    promotedBy: user.id!,
  });

  const committee = await assertCommitteeInSchool(signup.committeeId, schoolId);
  await revalidateCommittee(signup.committeeId, committee.joinCode);
  return result;
}

/** Board only — chair is an assignment, not something a chair can hand out. */
export async function updateCommitteeMemberRole(
  signupId: string,
  role: CommitteeRole
) {
  const { schoolId } = await assertCommitteeManager();
  const signup = await assertSignupInSchool(signupId, schoolId);

  await db
    .update(committeeSignups)
    .set({ role })
    .where(eq(committeeSignups.id, signupId));

  // Re-derive rather than setting the member row directly: someone may hold a
  // chair signup elsewhere in this committee's history, and the derivation is
  // the single place that decision lives.
  if (signup.userId) {
    await syncCommitteeMembership(signup.userId, signup.committeeId);
  }

  const committee = await assertCommitteeInSchool(signup.committeeId, schoolId);
  await revalidateCommittee(signup.committeeId, committee.joinCode);
}

export async function exportCommitteeRoster(committeeId: string): Promise<string> {
  const user = await assertAuthenticated();
  const access = await assertCommitteeChair(user.id!, committeeId);
  const committee = await assertCommitteeInSchool(committeeId, access.schoolId);

  const rows = await db.query.committeeSignups.findMany({
    where: and(
      eq(committeeSignups.committeeId, committeeId),
      ne(committeeSignups.status, "removed")
    ),
    orderBy: [asc(committeeSignups.waitlistedAt), asc(committeeSignups.createdAt)],
  });

  // The room a volunteer covers is the whole point of an "every classroom"
  // committee, so the export a board member hands around has to carry it.
  const isPerClassroom = committee.scope === "all_classrooms";
  const classroomNames = isPerClassroom
    ? await loadClassroomNames(committee.schoolId, committee.schoolYear)
    : new Map<string, string>();

  let position = 0;
  return toCsv(
    [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      ...(isPerClassroom
        ? [{ key: "classroom", label: "Classroom" }]
        : []),
      { key: "role", label: "Role" },
      { key: "status", label: "Status" },
      { key: "waitlistPosition", label: "Waitlist Position" },
      { key: "willingToChair", label: "Willing to Chair" },
      { key: "notes", label: "Notes" },
      { key: "signedUp", label: "Signed Up" },
    ],
    rows.map((r) => {
      const waitlisted = r.status === "waitlisted";
      if (waitlisted) position += 1;
      return {
        name: r.name,
        email: r.email,
        phone: r.phone ? formatPhoneNumber(r.phone) : "",
        classroom: r.classroomId ? classroomNames.get(r.classroomId) ?? "" : "",
        role: r.role === "chair" ? "Chair" : "Member",
        status: waitlisted ? "Waitlist" : "Active",
        waitlistPosition: waitlisted ? String(position) : "",
        willingToChair: r.willingToChair ? "Yes" : "",
        notes: r.notes ?? "",
        signedUp: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "",
      };
    })
  );
}

// ─── Reads ─────────────────────────────────────────────────────────────────

export interface CommitteeSummary {
  id: string;
  name: string;
  description: string | null;
  iconEmoji: string | null;
  imageUrl: string | null;
  scope: CommitteeScope;
  scopeLabel: string;
  status: CommitteeStatus;
  capacityMode: CapacityMode;
  minSize: number | null;
  maxSize: number | null;
  memberCount: number;
  waitlistCount: number;
  /** Members still needed to hit `minSize`. Zero when there's no goal or it's met. */
  stillNeeded: number;
  chairNames: string[];
  archivedAt: Date | null;
  /** Set for a member viewing their own waitlisted committee. */
  myWaitlistPosition?: number;
}

/** Counts every committee's roster and waitlist in two queries, not 2N. */
async function loadCounts(committeeIds: string[]) {
  if (committeeIds.length === 0) {
    return { seated: new Map<string, number>(), queued: new Map<string, number>() };
  }
  const rows = await db
    .select({
      committeeId: committeeSignups.committeeId,
      status: committeeSignups.status,
      total: count(),
    })
    .from(committeeSignups)
    .where(inArray(committeeSignups.committeeId, committeeIds))
    .groupBy(committeeSignups.committeeId, committeeSignups.status);

  const seated = new Map<string, number>();
  const queued = new Map<string, number>();
  for (const row of rows) {
    if (row.status === "active") seated.set(row.committeeId, row.total);
    if (row.status === "waitlisted") queued.set(row.committeeId, row.total);
  }
  return { seated, queued };
}

async function loadChairNames(committeeIds: string[]) {
  const byCommittee = new Map<string, string[]>();
  if (committeeIds.length === 0) return byCommittee;

  const rows = await db
    .select({
      committeeId: committeeSignups.committeeId,
      name: committeeSignups.name,
    })
    .from(committeeSignups)
    .where(
      and(
        inArray(committeeSignups.committeeId, committeeIds),
        eq(committeeSignups.role, "chair"),
        eq(committeeSignups.status, "active")
      )
    );

  for (const row of rows) {
    byCommittee.set(row.committeeId, [
      ...(byCommittee.get(row.committeeId) ?? []),
      row.name,
    ]);
  }
  return byCommittee;
}

function scopeLabelFor(row: {
  scope: string;
  perClassroomLimit?: number | null;
  classroom?: { name: string } | null;
  eventPlan?: { title: string } | null;
}): string {
  if (row.scope === "classroom") return row.classroom?.name ?? "Classroom removed";
  if (row.scope === "event_plan") return row.eventPlan?.title ?? "Linked event removed";
  if (row.scope === "all_classrooms") {
    return row.perClassroomLimit
      ? `Every classroom · ${row.perClassroomLimit} per room`
      : "Every classroom";
  }
  return "School-wide";
}

/**
 * Board / admin: every active committee for the current year. Everyone else:
 * only the ones they're on, plus any they're waiting in line for.
 */
export async function getCommittees(): Promise<{
  committees: CommitteeSummary[];
  canManage: boolean;
}> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return { committees: [], canManage: false };

  const schoolYear = await getSchoolCurrentYear(schoolId);
  const canManage = await isBoardMember(user.id!, schoolId);

  const all = await db.query.committees.findMany({
    where: and(
      eq(committees.schoolId, schoolId),
      eq(committees.schoolYear, schoolYear),
      isNull(committees.archivedAt)
    ),
    with: {
      classroom: { columns: { name: true } },
      eventPlan: { columns: { title: true } },
    },
    orderBy: [asc(committees.sortOrder), asc(committees.name)],
  });

  // A member's own signups decide both which committees they see and whether
  // they're seated or still in line.
  const mySignups = await db.query.committeeSignups.findMany({
    where: and(
      eq(committeeSignups.schoolId, schoolId),
      eq(committeeSignups.userId, user.id!),
      ne(committeeSignups.status, "removed")
    ),
    columns: { committeeId: true, status: true, waitlistedAt: true },
  });
  const mine = new Map(mySignups.map((s) => [s.committeeId, s]));

  // Drafts are the board's scratch space; nobody else should see one listed,
  // even if a manual add already put them on it.
  const visible = canManage
    ? all
    : all.filter((c) => mine.has(c.id) && c.status !== "draft");

  const ids = visible.map((c) => c.id);
  const [{ seated, queued }, chairs] = await Promise.all([
    loadCounts(ids),
    loadChairNames(ids),
  ]);

  const summaries = await Promise.all(
    visible.map(async (c) => {
      const memberCount = seated.get(c.id) ?? 0;
      const mySignup = mine.get(c.id);
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        iconEmoji: c.iconEmoji,
        imageUrl: c.imageUrl,
        scope: c.scope as CommitteeScope,
        scopeLabel: scopeLabelFor(c),
        status: c.status as CommitteeStatus,
        capacityMode: c.capacityMode as CapacityMode,
        minSize: c.minSize,
        maxSize: c.maxSize,
        memberCount,
        waitlistCount: queued.get(c.id) ?? 0,
        stillNeeded: c.minSize ? Math.max(0, c.minSize - memberCount) : 0,
        chairNames: chairs.get(c.id) ?? [],
        archivedAt: c.archivedAt,
        ...(mySignup?.status === "waitlisted" && {
          myWaitlistPosition: await waitlistPosition(c.id, mySignup.waitlistedAt),
        }),
      };
    })
  );

  return { committees: summaries, canManage };
}

async function isBoardMember(userId: string, schoolId: string) {
  try {
    await assertSchoolPtaBoardOrAdmin(userId, schoolId);
    return true;
  } catch {
    return false;
  }
}

/** 1-based place in line, ordered by `waitlistedAt`. */
async function waitlistPosition(committeeId: string, waitlistedAt: Date | null) {
  if (!waitlistedAt) return 1;
  const [{ ahead }] = await db
    .select({ ahead: count() })
    .from(committeeSignups)
    .where(
      and(
        eq(committeeSignups.committeeId, committeeId),
        eq(committeeSignups.status, "waitlisted"),
        sql`${committeeSignups.waitlistedAt} < ${waitlistedAt}`
      )
    );
  return ahead + 1;
}

/** The member-facing workspace: roster, messages, tasks. */
export async function getCommitteeDetail(committeeId: string) {
  const user = await assertAuthenticated();
  const access = await assertCommitteeAccess(user.id!, committeeId);

  const committee = await db.query.committees.findFirst({
    where: eq(committees.id, committeeId),
    with: {
      classroom: { columns: { id: true, name: true } },
      eventPlan: { columns: { id: true, title: true } },
    },
  });
  if (!committee) throw new Error("Committee not found");

  const [messages, tasks, roster] = await Promise.all([
    db
      .select({
        id: committeeMessages.id,
        message: committeeMessages.message,
        createdAt: committeeMessages.createdAt,
        authorId: committeeMessages.authorId,
        chairsOnly: committeeMessages.chairsOnly,
        authorName: users.name,
        authorEmail: users.email,
      })
      .from(committeeMessages)
      .leftJoin(users, eq(committeeMessages.authorId, users.id))
      .where(eq(committeeMessages.committeeId, committeeId))
      .orderBy(asc(committeeMessages.createdAt)),
    db
      .select({
        id: committeeTasks.id,
        title: committeeTasks.title,
        description: committeeTasks.description,
        completed: committeeTasks.completed,
        dueDate: committeeTasks.dueDate,
        createdAt: committeeTasks.createdAt,
        assigneeId: committeeTasks.assignedTo,
        assigneeName: users.name,
      })
      .from(committeeTasks)
      .leftJoin(users, eq(committeeTasks.assignedTo, users.id))
      .where(eq(committeeTasks.committeeId, committeeId))
      .orderBy(desc(committeeTasks.createdAt)),
    db.query.committeeSignups.findMany({
      where: and(
        eq(committeeSignups.committeeId, committeeId),
        ne(committeeSignups.status, "removed")
      ),
      orderBy: [asc(committeeSignups.waitlistedAt), asc(committeeSignups.createdAt)],
    }),
  ]);

  const active = roster.filter((r) => r.status === "active");
  const waitlist = roster.filter((r) => r.status === "waitlisted");

  // An "every classroom" signup names the room it covers, so the roster has to
  // resolve those ids to names. Every other scope leaves `classroomId` null.
  const classroomNames =
    committee.scope === "all_classrooms"
      ? await loadClassroomNames(committee.schoolId, committee.schoolYear)
      : new Map<string, string>();
  const roomOf = (classroomId: string | null) =>
    classroomId ? classroomNames.get(classroomId) ?? null : null;

  // The shared schedule, only when the committee opted in. Every member sees the
  // whole list — cross-classroom visibility is the point for Meet the Masters.
  const schedule: CommitteeScheduleSlot[] = committee.schedulingEnabled
    ? await getCommitteeSchedule(committeeId)
    : [];

  // Classrooms to tag a slot with, for the chair building the schedule.
  const scheduleClassrooms =
    committee.schedulingEnabled && access.isChair
      ? await db.query.classrooms.findMany({
          where: and(
            eq(classrooms.schoolId, committee.schoolId),
            eq(classrooms.schoolYear, committee.schoolYear)
          ),
          columns: { id: true, name: true, gradeLevel: true },
          orderBy: [asc(classrooms.gradeLevel), asc(classrooms.name)],
        })
      : [];

  return {
    committee: {
      id: committee.id,
      name: committee.name,
      description: committee.description,
      responsibilities: committee.responsibilities,
      typicalTiming: committee.typicalTiming,
      timeCommitment: committee.timeCommitment,
      iconEmoji: committee.iconEmoji,
      imageUrl: committee.imageUrl,
      scope: committee.scope as CommitteeScope,
      scopeLabel: scopeLabelFor(committee),
      classroomId: committee.classroom?.id ?? null,
      eventPlanId: committee.eventPlan?.id ?? null,
      status: committee.status as CommitteeStatus,
      capacityMode: committee.capacityMode as CapacityMode,
      minSize: committee.minSize,
      maxSize: committee.maxSize,
      contactEmail: committee.contactEmail,
      schoolYear: committee.schoolYear,
      schedulingEnabled: committee.schedulingEnabled,
    },
    isChair: access.isChair,
    isBoardMember: access.isBoardMember,
    schedule,
    scheduleClassrooms,
    messages: messages
      // A chairs-only post is invisible to plain members. Filtering server-side
      // rather than hiding it in the client keeps it out of the payload too.
      .filter((m) => !m.chairsOnly || access.isChair)
      .map((m) => ({
        id: m.id,
        message: m.message,
        createdAt: m.createdAt?.toISOString() ?? new Date().toISOString(),
        authorId: m.authorId,
        chairsOnly: m.chairsOnly,
        author: m.authorName
          ? { name: m.authorName, email: m.authorEmail ?? "" }
          : null,
      })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      completed: t.completed,
      dueDate: t.dueDate?.toISOString() ?? null,
      assigneeId: t.assigneeId,
      assignee: t.assigneeName ? { name: t.assigneeName } : null,
    })),
    members: active.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      email: r.email,
      phone: r.phone ? formatPhoneNumber(r.phone) : null,
      role: r.role as CommitteeRole,
      willingToChair: r.willingToChair,
      notes: r.notes,
      classroomId: r.classroomId,
      classroomName: roomOf(r.classroomId),
    })),
    // The waitlist — including waitlisted parents' email and phone — is chairs
    // and board only, matching how the roster UI gates it. Filtering here rather
    // than in the client keeps the contact PII out of a plain member's payload,
    // exactly like the chairs-only messages above.
    waitlist: access.isChair
      ? waitlist.map((r, index) => ({
          id: r.id,
          userId: r.userId,
          name: r.name,
          email: r.email,
          phone: r.phone ? formatPhoneNumber(r.phone) : null,
          position: index + 1,
          role: r.role as CommitteeRole,
          willingToChair: r.willingToChair,
          notes: r.notes,
          classroomId: r.classroomId,
          classroomName: roomOf(r.classroomId),
        }))
      : [],
  };
}

/** id → name for every room in a school year, for resolving signup rooms. */
async function loadClassroomNames(schoolId: string, schoolYear: string) {
  const rooms = await db.query.classrooms.findMany({
    where: and(
      eq(classrooms.schoolId, schoolId),
      eq(classrooms.schoolYear, schoolYear)
    ),
    columns: { id: true, name: true },
  });
  return new Map(rooms.map((r) => [r.id, r.name]));
}

/** Board view of one committee: config, roster with contact info, QR payload. */
export async function getCommitteeAdminDetail(committeeId: string) {
  const { schoolId } = await assertCommitteeManager();
  const committee = await assertCommitteeInSchool(committeeId, schoolId);

  const detail = await getCommitteeDetail(committeeId);
  const joinUrl = buildJoinUrl(committee.joinCode);
  const qrDataUrl = joinUrl ? await toQrDataUrl(joinUrl) : null;

  const { classroomOptions, eventPlanOptions } = await loadScopeOptions(
    schoolId,
    committee.schoolYear
  );

  // Only an "every classroom" committee has rooms to cover. For everything else
  // the roster is the whole story and this stays null.
  const classroomCoverage =
    committee.scope === "all_classrooms"
      ? await buildClassroomCoverage(
          schoolId,
          committee.schoolYear,
          committee.perClassroomLimit ?? 1,
          detail.members,
          detail.waitlist
        )
      : null;

  return {
    ...detail,
    classroomCoverage,
    config: {
      id: committee.id,
      name: committee.name,
      description: committee.description,
      responsibilities: committee.responsibilities,
      typicalTiming: committee.typicalTiming,
      timeCommitment: committee.timeCommitment,
      iconEmoji: committee.iconEmoji,
      imageUrl: committee.imageUrl,
      scope: committee.scope as CommitteeScope,
      classroomId: committee.classroomId,
      eventPlanId: committee.eventPlanId,
      grantsLinkedAccess: committee.grantsLinkedAccess,
      showOnRoomParentSignup: committee.showOnRoomParentSignup,
      showPerClassroomOnSignup: committee.showPerClassroomOnSignup,
      perClassroomLimit: committee.perClassroomLimit,
      schedulingEnabled: committee.schedulingEnabled,
      capacityMode: committee.capacityMode as CapacityMode,
      minSize: committee.minSize,
      maxSize: committee.maxSize,
      waitlistEnabled: committee.waitlistEnabled,
      opensAt: committee.opensAt?.toISOString() ?? null,
      closesAt: committee.closesAt?.toISOString() ?? null,
      ownerPosition: committee.ownerPosition,
      contactEmail: committee.contactEmail,
      status: committee.status as CommitteeStatus,
      archivedAt: committee.archivedAt,
      schoolYear: committee.schoolYear,
    },
    joinCode: committee.joinCode,
    joinUrl,
    qrDataUrl,
    classroomOptions,
    eventPlanOptions,
  };
}

// ─── Per-Classroom Coverage ────────────────────────────────────────────────

/**
 * A room a parent may sign up for. The PTA Board is stored as a classroom so it
 * can reuse message boards and rosters, but nobody volunteers for it — mirrors
 * `isSignupEligible` on the room parent dashboard. Rows predating the column can
 * be NULL, so NULL counts as eligible.
 */
const isCoverageEligibleClassroom = or(
  eq(classrooms.excludeFromSignup, false),
  isNull(classrooms.excludeFromSignup)
);

export interface CoveragePerson {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: CommitteeRole;
  willingToChair: boolean;
  notes: string | null;
  /** Place in this room's line. Waitlisted entries only. */
  position?: number;
}

export interface ClassroomCoverageRoom {
  classroom: { id: string; name: string; gradeLevel: string | null };
  members: CoveragePerson[];
  waitlist: CoveragePerson[];
  filled: number;
  limit: number;
}

export interface ClassroomCoverage {
  perClassroomLimit: number;
  rooms: ClassroomCoverageRoom[];
  /** Seats needed across every room, and how many are taken. */
  seatsNeeded: number;
  seatsFilled: number;
  fullRooms: number;
  partialRooms: number;
  emptyRooms: number;
  /**
   * Active signups whose room was deleted, or that predate the per-classroom
   * setting. They hold a seat but cover nothing — surfaced so the board can
   * re-add them to a room rather than wonder why the totals don't add up.
   */
  unassigned: CoveragePerson[];
}

/**
 * "Which rooms still need people" for an every-classroom committee — the direct
 * analogue of the room parent dashboard's coverage table, built from the roster
 * the caller already loaded rather than re-querying the signups.
 */
async function buildClassroomCoverage(
  schoolId: string,
  schoolYear: string,
  perClassroomLimit: number,
  members: Array<CoveragePerson & { classroomId: string | null }>,
  waitlist: Array<CoveragePerson & { classroomId: string | null }>
): Promise<ClassroomCoverage> {
  const rooms = await db.query.classrooms.findMany({
    where: and(
      eq(classrooms.schoolId, schoolId),
      eq(classrooms.schoolYear, schoolYear),
      eq(classrooms.active, true),
      isCoverageEligibleClassroom
    ),
    columns: { id: true, name: true, gradeLevel: true },
    orderBy: [asc(classrooms.gradeLevel), asc(classrooms.name)],
  });

  // The room and the committee-wide waitlist position are re-derived per room
  // below, so neither travels with the person.
  const strip = (
    p: CoveragePerson & { classroomId: string | null }
  ): CoveragePerson => ({
    id: p.id,
    userId: p.userId,
    name: p.name,
    email: p.email,
    phone: p.phone,
    role: p.role,
    willingToChair: p.willingToChair,
    notes: p.notes,
  });

  const coverage = rooms.map((classroom) => {
    const roomMembers = members
      .filter((m) => m.classroomId === classroom.id)
      .map(strip);
    // The roster arrives ordered by `waitlistedAt`, so filtering to one room
    // keeps the line intact — the numbering just restarts per room, which is
    // how the waitlist actually promotes.
    const roomWaitlist = waitlist
      .filter((w) => w.classroomId === classroom.id)
      .map((w, index) => ({ ...strip(w), position: index + 1 }));

    return {
      classroom,
      members: roomMembers,
      waitlist: roomWaitlist,
      filled: roomMembers.length,
      limit: perClassroomLimit,
    };
  });

  const roomIds = new Set(rooms.map((r) => r.id));

  return {
    perClassroomLimit,
    rooms: coverage,
    seatsNeeded: rooms.length * perClassroomLimit,
    seatsFilled: coverage.reduce((sum, r) => sum + Math.min(r.filled, r.limit), 0),
    fullRooms: coverage.filter((r) => r.filled >= r.limit).length,
    partialRooms: coverage.filter((r) => r.filled > 0 && r.filled < r.limit).length,
    emptyRooms: coverage.filter((r) => r.filled === 0).length,
    unassigned: members
      .filter((m) => !m.classroomId || !roomIds.has(m.classroomId))
      .map(strip),
  };
}

/**
 * Classrooms and event plans a committee can be scoped to. Shared by the detail
 * (edit) view and the create dialog so the "A classroom" / "An event plan"
 * scope options are selectable in both — the create form was previously handed
 * empty arrays, which left both options permanently greyed out.
 */
async function loadScopeOptions(schoolId: string, schoolYear: string) {
  const [classroomOptions, eventPlanOptions] = await Promise.all([
    db.query.classrooms.findMany({
      where: and(
        eq(classrooms.schoolId, schoolId),
        eq(classrooms.schoolYear, schoolYear)
      ),
      columns: { id: true, name: true, gradeLevel: true },
      orderBy: [asc(classrooms.gradeLevel), asc(classrooms.name)],
    }),
    db.query.eventPlans.findMany({
      where: eq(eventPlans.schoolId, schoolId),
      columns: { id: true, title: true, schoolYear: true },
      orderBy: [desc(eventPlans.createdAt)],
      limit: 100,
    }),
  ]);
  return { classroomOptions, eventPlanOptions };
}

/** Scope options for the create dialog, scoped to the school's current year. */
export async function getCommitteeScopeOptions() {
  const { schoolId } = await assertCommitteeManager();
  const schoolYear = await getSchoolCurrentYear(schoolId);
  return loadScopeOptions(schoolId, schoolYear);
}

/** Admin list — includes drafts and archived, which `getCommittees` hides. */
export async function getCommitteeAdminList() {
  const { schoolId } = await assertCommitteeManager();
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const rows = await db.query.committees.findMany({
    where: and(
      eq(committees.schoolId, schoolId),
      eq(committees.schoolYear, schoolYear)
    ),
    with: {
      classroom: { columns: { name: true } },
      eventPlan: { columns: { title: true } },
    },
    orderBy: [asc(committees.sortOrder), asc(committees.name)],
  });

  const ids = rows.map((r) => r.id);
  const [{ seated, queued }, chairs] = await Promise.all([
    loadCounts(ids),
    loadChairNames(ids),
  ]);

  return rows.map((c) => {
    const memberCount = seated.get(c.id) ?? 0;
    return {
      id: c.id,
      name: c.name,
      iconEmoji: c.iconEmoji,
      scope: c.scope as CommitteeScope,
      scopeLabel: scopeLabelFor(c),
      status: c.status as CommitteeStatus,
      capacityMode: c.capacityMode as CapacityMode,
      minSize: c.minSize,
      maxSize: c.maxSize,
      memberCount,
      waitlistCount: queued.get(c.id) ?? 0,
      stillNeeded: c.minSize ? Math.max(0, c.minSize - memberCount) : 0,
      chairNames: chairs.get(c.id) ?? [],
      showOnRoomParentSignup: c.showOnRoomParentSignup,
      showPerClassroomOnSignup: c.showPerClassroomOnSignup,
      archivedAt: c.archivedAt,
    };
  });
}

function buildJoinUrl(joinCode: string): string {
  const baseUrl = getAppBaseUrl();
  return baseUrl ? `${baseUrl}/committee/${joinCode}` : "";
}

function toQrDataUrl(url: string) {
  return QRCode.toDataURL(url, {
    width: 400,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

// ─── Public Reads ──────────────────────────────────────────────────────────

export interface PublicCommittee {
  id: string;
  name: string;
  description: string | null;
  responsibilities: string | null;
  typicalTiming: string | null;
  timeCommitment: string | null;
  iconEmoji: string | null;
  imageUrl: string | null;
  contactEmail: string | null;
  schoolName: string;
  capacityMode: CapacityMode;
  minSize: number | null;
  maxSize: number | null;
  waitlistEnabled: boolean;
  memberCount: number;
  waitlistCount: number;
  /** Seats left. Null when the committee is open-ended. */
  spotsRemaining: number | null;
  /** Members still wanted to hit `minSize`. Zero when met or unset. */
  stillNeeded: number;
  /** True when capped, full, and no waitlist — the form is replaced. */
  isClosedToNewMembers: boolean;
  eligibility: VolunteerEligibilityInfo | null;
}

async function toPublicCommittee(committee: {
  id: string;
  name: string;
  description: string | null;
  responsibilities: string | null;
  typicalTiming: string | null;
  timeCommitment: string | null;
  iconEmoji: string | null;
  imageUrl: string | null;
  contactEmail: string | null;
  capacityMode: string;
  minSize: number | null;
  maxSize: number | null;
  waitlistEnabled: boolean;
  school: { name: string; volunteerSettings: unknown };
}): Promise<PublicCommittee> {
  const { seated, queued } = await loadCounts([committee.id]);
  const memberCount = seated.get(committee.id) ?? 0;
  const capped = committee.capacityMode === "capped" && committee.maxSize !== null;
  const spotsRemaining = capped ? Math.max(0, committee.maxSize! - memberCount) : null;

  return {
    id: committee.id,
    name: committee.name,
    description: committee.description,
    responsibilities: committee.responsibilities,
    typicalTiming: committee.typicalTiming,
    timeCommitment: committee.timeCommitment,
    iconEmoji: committee.iconEmoji,
    imageUrl: committee.imageUrl,
    contactEmail: committee.contactEmail,
    schoolName: committee.school.name,
    capacityMode: committee.capacityMode as CapacityMode,
    minSize: committee.minSize,
    maxSize: committee.maxSize,
    waitlistEnabled: committee.waitlistEnabled,
    memberCount,
    waitlistCount: queued.get(committee.id) ?? 0,
    spotsRemaining,
    stillNeeded: committee.minSize
      ? Math.max(0, committee.minSize - memberCount)
      : 0,
    isClosedToNewMembers:
      spotsRemaining === 0 && !committee.waitlistEnabled,
    eligibility: resolveVolunteerEligibility(
      (committee.school.volunteerSettings as { eligibility?: unknown } | null)
        ?.eligibility as never
    ),
  };
}

/** Unauthenticated read for `/committee/[code]`. Null unless open right now. */
export async function getPublicCommittee(
  joinCode: string
): Promise<PublicCommittee | null> {
  const committee = await db.query.committees.findFirst({
    where: eq(committees.joinCode, joinCode),
    with: { school: { columns: { name: true, volunteerSettings: true } } },
  });

  if (!committee || !isCommitteeOpen(committee)) return null;
  return toPublicCommittee(committee);
}

/**
 * Committees that ride along on the room parent signup page.
 *
 * A full committee is still returned when `waitlistEnabled` — it renders as
 * "Full — join the waitlist" rather than disappearing between the flyer being
 * printed and the parent scanning it.
 */
export async function getRoomParentAddonCommittees(
  schoolId: string,
  schoolYear: string
): Promise<PublicCommittee[]> {
  const rows = await db.query.committees.findMany({
    where: and(
      eq(committees.schoolId, schoolId),
      eq(committees.schoolYear, schoolYear),
      eq(committees.showOnRoomParentSignup, true)
    ),
    with: { school: { columns: { name: true, volunteerSettings: true } } },
    orderBy: [asc(committees.sortOrder), asc(committees.name)],
  });

  const open = rows.filter((c) => isCommitteeOpen(c));
  const resolved = await Promise.all(open.map(toPublicCommittee));
  // A committee that's full with no waitlist is a dead end — leave it off the
  // page entirely rather than rendering a disabled card nobody can act on.
  return resolved.filter((c) => !c.isClosedToNewMembers);
}

/** Used by the room parent page, which only has the school's volunteer QR code. */
export async function getRoomParentAddonCommitteesByQrCode(
  volunteerQrCode: string
): Promise<PublicCommittee[]> {
  const school = await db.query.schools.findFirst({
    where: eq(schools.volunteerQrCode, volunteerQrCode),
    columns: { id: true },
  });
  if (!school) return [];

  const schoolYear = await getSchoolCurrentYear(school.id);
  return getRoomParentAddonCommittees(school.id, schoolYear);
}

/**
 * A committee offered *under each classroom* on the room parent signup page
 * (Meet the Masters), with the per-classroom seat counts the form needs to show
 * "0 of 2 filled" and disable a full room. Unlike the flat checklist, these
 * render inside the classroom card the parent already picked.
 */
export interface PerClassroomCommittee {
  id: string;
  name: string;
  iconEmoji: string | null;
  description: string | null;
  timeCommitment: string | null;
  perClassroomLimit: number | null;
  waitlistEnabled: boolean;
  /** classroomId → seats already taken in that room. Missing means zero. */
  countsByClassroom: Record<string, number>;
}

export async function getPerClassroomCommittees(
  schoolId: string,
  schoolYear: string
): Promise<PerClassroomCommittee[]> {
  const rows = await db.query.committees.findMany({
    where: and(
      eq(committees.schoolId, schoolId),
      eq(committees.schoolYear, schoolYear),
      // Both conditions on purpose: only an "every classroom" committee has a
      // per-room meaning, and only an opted-in one belongs on this page.
      eq(committees.scope, "all_classrooms"),
      eq(committees.showPerClassroomOnSignup, true)
    ),
    orderBy: [asc(committees.sortOrder), asc(committees.name)],
  });

  const open = rows.filter((c) => isCommitteeOpen(c));
  if (open.length === 0) return [];

  const ids = open.map((c) => c.id);
  const countRows = await db
    .select({
      committeeId: committeeSignups.committeeId,
      classroomId: committeeSignups.classroomId,
      total: count(),
    })
    .from(committeeSignups)
    .where(
      and(
        inArray(committeeSignups.committeeId, ids),
        eq(committeeSignups.status, "active")
      )
    )
    .groupBy(committeeSignups.committeeId, committeeSignups.classroomId);

  const countsByCommittee = new Map<string, Record<string, number>>();
  for (const row of countRows) {
    if (!row.classroomId) continue; // school-wide rows never gate a room
    const map = countsByCommittee.get(row.committeeId) ?? {};
    map[row.classroomId] = row.total;
    countsByCommittee.set(row.committeeId, map);
  }

  return open.map((c) => ({
    id: c.id,
    name: c.name,
    iconEmoji: c.iconEmoji,
    description: c.description,
    timeCommitment: c.timeCommitment,
    perClassroomLimit: c.perClassroomLimit,
    waitlistEnabled: c.waitlistEnabled,
    countsByClassroom: countsByCommittee.get(c.id) ?? {},
  }));
}

/** Used by the room parent page, which only has the school's volunteer QR code. */
export async function getPerClassroomCommitteesByQrCode(
  volunteerQrCode: string
): Promise<PerClassroomCommittee[]> {
  const school = await db.query.schools.findFirst({
    where: eq(schools.volunteerQrCode, volunteerQrCode),
    columns: { id: true },
  });
  if (!school) return [];

  const schoolYear = await getSchoolCurrentYear(school.id);
  return getPerClassroomCommittees(school.id, schoolYear);
}

// ─── Public Submission ─────────────────────────────────────────────────────

export interface CommitteeJoinSubmission {
  name: string;
  email: string;
  phone?: string;
  /** "I'd be willing to chair this" — a checkbox on the join form. */
  willingToChair?: boolean;
  notes?: string;
}

export interface CommitteeJoinResponse {
  success: boolean;
  committeeName?: string;
  /** True when the volunteer landed on the waitlist rather than the roster. */
  waitlisted?: boolean;
  waitlistPosition?: number;
  error?: string;
}

/**
 * Public join from `/committee/[code]`.
 *
 * A waitlist placement is a success, not an error — "The Yearbook Committee is
 * full, so you're #3 on the waitlist" is a perfectly good outcome. Only a hard
 * dead end (full with no waitlist, or a closed link) is a failure.
 */
export async function joinCommittee(
  joinCode: string,
  data: CommitteeJoinSubmission
): Promise<CommitteeJoinResponse> {
  const committee = await db.query.committees.findFirst({
    where: eq(committees.joinCode, joinCode),
    with: { school: { columns: { id: true, name: true } } },
  });

  if (!committee || !isCommitteeOpen(committee)) {
    return {
      success: false,
      error: "This committee is no longer accepting sign-ups.",
    };
  }

  const validation = normalizeContact(data);
  if (!validation.ok) return { success: false, error: validation.error };
  const contact = validation.contact;

  const existingUser = await linkExistingAccountToSchool(
    contact.email,
    committee.schoolId,
    committee.schoolYear
  );

  const result = await recordCommitteeSignup({
    schoolId: committee.schoolId,
    committeeId: committee.id,
    contact,
    willingToChair: data.willingToChair ?? false,
    notes: data.notes?.trim() || null,
    schoolYear: committee.schoolYear,
    signupSource: "qr_code",
    userId: existingUser?.id ?? null,
  });

  if (result.outcome === "full") {
    return { success: false, error: "This committee is full." };
  }
  if (result.outcome === "closed") {
    return {
      success: false,
      error: "This committee is no longer accepting sign-ups.",
    };
  }

  const waitlisted = result.outcome === "waitlisted";

  try {
    await sendWelcomeEmail({
      email: contact.email,
      name: contact.name,
      schoolId: committee.schoolId,
      schoolName: committee.school.name,
      signups: [
        {
          role: waitlisted
            ? `${committee.name} — waitlist #${result.waitlistPosition}`
            : `${committee.name} member`,
        },
      ],
      listIntro: waitlisted
        ? "You're on the waitlist for:"
        : "You've joined:",
      benefits: waitlisted
        ? [
            "We'll email you the moment a spot opens",
            "PTA announcements, budget, and fundraiser progress",
            "The school calendar and event details in one place",
          ]
        : [
            "The committee's message board",
            "Shared task lists so nothing falls through",
            "Contact info for the rest of the committee",
          ],
      callbackPath: "/committees",
    });
  } catch (error) {
    console.error("Failed to send committee welcome email:", error);
    // An email failure must not lose the signup.
  }

  await revalidateCommittee(committee.id, committee.joinCode);
  return {
    success: true,
    committeeName: committee.name,
    waitlisted,
    waitlistPosition: result.waitlistPosition,
  };
}

// ─── Workspace Mutations ───────────────────────────────────────────────────

export async function sendCommitteeMessage(
  committeeId: string,
  message: string,
  chairsOnly = false
) {
  const user = await assertAuthenticated();
  // Posting to the chairs-only board is the one message action a plain member
  // can't do, so the assert differs rather than the write.
  if (chairsOnly) {
    await assertCommitteeChair(user.id!, committeeId);
  } else {
    await assertCommitteeAccess(user.id!, committeeId);
  }

  const body = message.trim();
  if (!body) return;

  await db.insert(committeeMessages).values({
    committeeId,
    authorId: user.id!,
    message: body,
    chairsOnly,
  });

  revalidatePath(`/committees/${committeeId}`);
}

export async function createCommitteeTask(
  committeeId: string,
  data: { title: string; description?: string; dueDate?: string; assignedTo?: string }
) {
  const user = await assertAuthenticated();
  await assertCommitteeAccess(user.id!, committeeId);

  const title = data.title.trim();
  if (!title) throw new Error("Give the task a title.");

  // Never trust an assignee id from the client: it has to be someone actually
  // on this committee, or a task could name an arbitrary account.
  let assignedTo: string | null = null;
  if (data.assignedTo) {
    const member = await db.query.committeeMembers.findFirst({
      where: and(
        eq(committeeMembers.committeeId, committeeId),
        eq(committeeMembers.userId, data.assignedTo)
      ),
      columns: { userId: true },
    });
    assignedTo = member?.userId ?? null;
  }

  await db.insert(committeeTasks).values({
    committeeId,
    createdBy: user.id!,
    title,
    description: data.description?.trim() || null,
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    assignedTo,
  });

  revalidatePath(`/committees/${committeeId}`);
}

/** Resolves a task to its committee so access is checked against the real row. */
async function assertTaskAccess(userId: string, taskId: string) {
  const task = await db.query.committeeTasks.findFirst({
    where: eq(committeeTasks.id, taskId),
    columns: { id: true, committeeId: true },
  });
  if (!task) throw new Error("Task not found");
  await assertCommitteeAccess(userId, task.committeeId);
  return task;
}

export async function updateCommitteeTaskStatus(taskId: string, completed: boolean) {
  const user = await assertAuthenticated();
  const task = await assertTaskAccess(user.id!, taskId);

  await db
    .update(committeeTasks)
    .set({ completed })
    .where(eq(committeeTasks.id, taskId));

  revalidatePath(`/committees/${task.committeeId}`);
}

export async function assignCommitteeTask(taskId: string, userId: string | null) {
  const user = await assertAuthenticated();
  const task = await assertTaskAccess(user.id!, taskId);

  let assignedTo: string | null = null;
  if (userId) {
    const member = await db.query.committeeMembers.findFirst({
      where: and(
        eq(committeeMembers.committeeId, task.committeeId),
        eq(committeeMembers.userId, userId)
      ),
      columns: { userId: true },
    });
    assignedTo = member?.userId ?? null;
  }

  await db
    .update(committeeTasks)
    .set({ assignedTo })
    .where(eq(committeeTasks.id, taskId));

  revalidatePath(`/committees/${task.committeeId}`);
}

export async function deleteCommitteeTask(taskId: string) {
  const user = await assertAuthenticated();
  const task = await assertTaskAccess(user.id!, taskId);

  await db.delete(committeeTasks).where(eq(committeeTasks.id, taskId));
  revalidatePath(`/committees/${task.committeeId}`);
}

// ─── Shared Schedule ───────────────────────────────────────────────────────
// An opt-in per committee (`schedulingEnabled`). Every member sees the full
// list regardless of the classroom they signed up under — the whole point for
// Meet the Masters, where only one classroom presents at a time.

export type CommitteeSlotStatus = "proposed" | "confirmed" | "cancelled";

export interface ScheduleSlotInput {
  title: string;
  classroomId?: string | null;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  notes?: string | null;
  status?: CommitteeSlotStatus;
}

export interface CommitteeScheduleSlot {
  id: string;
  title: string;
  classroomId: string | null;
  classroomName: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  notes: string | null;
  status: CommitteeSlotStatus;
  assignedSignupId: string | null;
  assigneeName: string | null;
}

/** The shared schedule for a committee. Any member (or board) may read it. */
export async function getCommitteeSchedule(
  committeeId: string
): Promise<CommitteeScheduleSlot[]> {
  const user = await assertAuthenticated();
  await assertCommitteeAccess(user.id!, committeeId);

  const rows = await db.query.committeeScheduleSlots.findMany({
    where: eq(committeeScheduleSlots.committeeId, committeeId),
    with: {
      classroom: { columns: { name: true } },
      assignedSignup: { columns: { name: true } },
    },
    orderBy: [asc(committeeScheduleSlots.startsAt)],
  });

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    classroomId: r.classroomId,
    classroomName: r.classroom?.name ?? null,
    startsAt: r.startsAt?.toISOString() ?? new Date().toISOString(),
    endsAt: r.endsAt?.toISOString() ?? null,
    location: r.location,
    notes: r.notes,
    status: r.status as CommitteeSlotStatus,
    assignedSignupId: r.assignedSignupId,
    assigneeName: r.assignedSignup?.name ?? null,
  }));
}

/**
 * Whether a proposed time collides with an already-`confirmed` slot on the same
 * committee. A warning, never a block — two classrooms genuinely can't present
 * at once, but the board sometimes needs to record an overlap on purpose.
 */
async function findScheduleConflict(
  committeeId: string,
  startsAt: Date,
  endsAt: Date | null,
  excludeSlotId?: string
): Promise<string | null> {
  const end = endsAt ?? startsAt;
  const confirmed = await db.query.committeeScheduleSlots.findMany({
    where: and(
      eq(committeeScheduleSlots.committeeId, committeeId),
      eq(committeeScheduleSlots.status, "confirmed")
    ),
    with: { classroom: { columns: { name: true } } },
  });

  for (const slot of confirmed) {
    if (excludeSlotId && slot.id === excludeSlotId) continue;
    const slotStart = slot.startsAt;
    if (!slotStart) continue;
    const slotEnd = slot.endsAt ?? slotStart;
    // Half-open overlap: [start, end) intersects [slotStart, slotEnd).
    if (startsAt < slotEnd && slotStart < end) {
      const who = slot.classroom?.name ?? slot.title;
      return `${who} is already scheduled at an overlapping time.`;
    }
  }
  return null;
}

/** Resolves a slot to its committee so access is checked against the real row. */
async function assertSlotChair(userId: string, slotId: string) {
  const slot = await db.query.committeeScheduleSlots.findFirst({
    where: eq(committeeScheduleSlots.id, slotId),
  });
  if (!slot) throw new Error("Schedule item not found");
  await assertCommitteeChair(userId, slot.committeeId);
  return slot;
}

export async function createScheduleSlot(
  committeeId: string,
  data: ScheduleSlotInput
): Promise<{ conflictWarning: string | null }> {
  const user = await assertAuthenticated();
  await assertCommitteeChair(user.id!, committeeId);

  const committee = await db.query.committees.findFirst({
    where: eq(committees.id, committeeId),
    columns: { id: true, schoolId: true },
  });
  if (!committee) throw new Error("Committee not found");

  const title = data.title.trim();
  if (!title) throw new Error("Give the schedule item a title.");
  if (!data.startsAt) throw new Error("Pick a date and time.");
  const startsAt = new Date(data.startsAt);
  const endsAt = data.endsAt ? new Date(data.endsAt) : null;

  // A classroom on a slot must belong to this school, same as anywhere else an
  // id arrives from a form.
  const classroomId = await resolveSlotClassroom(committee.schoolId, data.classroomId);

  const status = data.status ?? "proposed";
  const conflictWarning =
    status === "confirmed"
      ? await findScheduleConflict(committeeId, startsAt, endsAt)
      : null;

  await db.insert(committeeScheduleSlots).values({
    schoolId: committee.schoolId,
    committeeId,
    title,
    classroomId,
    startsAt,
    endsAt,
    location: data.location?.trim() || null,
    notes: data.notes?.trim() || null,
    status,
    createdBy: user.id!,
  });

  revalidatePath(`/committees/${committeeId}`);
  return { conflictWarning };
}

export async function updateScheduleSlot(
  slotId: string,
  data: ScheduleSlotInput
): Promise<{ conflictWarning: string | null }> {
  const user = await assertAuthenticated();
  const slot = await assertSlotChair(user.id!, slotId);

  const title = data.title.trim();
  if (!title) throw new Error("Give the schedule item a title.");
  if (!data.startsAt) throw new Error("Pick a date and time.");
  const startsAt = new Date(data.startsAt);
  const endsAt = data.endsAt ? new Date(data.endsAt) : null;
  const classroomId = await resolveSlotClassroom(slot.schoolId, data.classroomId);

  const status = data.status ?? (slot.status as CommitteeSlotStatus);
  const conflictWarning =
    status === "confirmed"
      ? await findScheduleConflict(slot.committeeId, startsAt, endsAt, slotId)
      : null;

  await db
    .update(committeeScheduleSlots)
    .set({
      title,
      classroomId,
      startsAt,
      endsAt,
      location: data.location?.trim() || null,
      notes: data.notes?.trim() || null,
      status,
      updatedAt: new Date(),
    })
    .where(eq(committeeScheduleSlots.id, slotId));

  revalidatePath(`/committees/${slot.committeeId}`);
  return { conflictWarning };
}

export async function deleteScheduleSlot(slotId: string) {
  const user = await assertAuthenticated();
  const slot = await assertSlotChair(user.id!, slotId);

  await db
    .delete(committeeScheduleSlots)
    .where(eq(committeeScheduleSlots.id, slotId));
  revalidatePath(`/committees/${slot.committeeId}`);
}

/**
 * Any member can grab an unclaimed slot for themselves — the "claim this date"
 * path that lets a volunteer pick up an open presentation without waiting on a
 * chair. Claiming an already-claimed slot is rejected.
 */
export async function claimScheduleSlot(slotId: string) {
  const user = await assertAuthenticated();
  const slot = await db.query.committeeScheduleSlots.findFirst({
    where: eq(committeeScheduleSlots.id, slotId),
  });
  if (!slot) throw new Error("Schedule item not found");
  await assertCommitteeAccess(user.id!, slot.committeeId);

  // Find the caller's own active signup on this committee — the slot points at a
  // signup, not a user, so a not-yet-authenticated volunteer can hold one too.
  const mine = await db.query.committeeSignups.findFirst({
    where: and(
      eq(committeeSignups.committeeId, slot.committeeId),
      eq(committeeSignups.userId, user.id!),
      eq(committeeSignups.status, "active")
    ),
    columns: { id: true },
  });
  if (!mine) throw new Error("You're not on this committee's roster.");
  if (slot.assignedSignupId && slot.assignedSignupId !== mine.id) {
    throw new Error("Someone already claimed this date.");
  }

  await db
    .update(committeeScheduleSlots)
    .set({ assignedSignupId: mine.id, updatedAt: new Date() })
    .where(eq(committeeScheduleSlots.id, slotId));
  revalidatePath(`/committees/${slot.committeeId}`);
}

/** A slot's classroom must be one of this school's classrooms, or null. */
async function resolveSlotClassroom(
  schoolId: string,
  classroomId?: string | null
): Promise<string | null> {
  if (!classroomId) return null;
  const classroom = await db.query.classrooms.findFirst({
    where: and(
      eq(classrooms.id, classroomId),
      eq(classrooms.schoolId, schoolId)
    ),
    columns: { id: true },
  });
  return classroom?.id ?? null;
}

// ─── Volunteer Hours ───────────────────────────────────────────────────────

/**
 * The caller's committees, for the volunteer-hours category picker. Read from
 * `committee_members` so nobody is offered a committee they aren't on.
 */
export async function getMyCommitteeOptions(): Promise<
  Array<{ id: string; name: string }>
> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return [];
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const rows = await db
    .select({ id: committees.id, name: committees.name })
    .from(committeeMembers)
    .innerJoin(committees, eq(committees.id, committeeMembers.committeeId))
    .where(
      and(
        eq(committeeMembers.userId, user.id!),
        eq(committees.schoolId, schoolId),
        eq(committees.schoolYear, schoolYear),
        isNull(committees.archivedAt)
      )
    )
    .orderBy(asc(committees.name));

  return rows;
}

// ─── School Year Rollover ──────────────────────────────────────────────────

/**
 * Copies each committee's configuration into the target year.
 *
 * Rosters are deliberately NOT copied: committee membership is a yearly
 * commitment, and carrying it silently would put last year's parents on this
 * year's message board without asking. Join codes are regenerated so a printed
 * flyer from last year can't quietly enroll someone into the new year.
 */
export async function promoteCommitteesToYear(
  targetYear: string,
  options: { committeeIds?: string[] } = {}
): Promise<{ copied: number; skipped: string[] }> {
  const { schoolId } = await assertCommitteeManager();
  const fromYear = await getSchoolCurrentYear(schoolId);

  const result = await copyCommitteesToYear(db, {
    schoolId,
    targetYear,
    fromYear,
    committeeIds: options.committeeIds,
  });

  revalidatePath("/admin/committees");
  return result;
}
