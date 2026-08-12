/**
 * Everything the member export computes, with no request in scope.
 *
 * Lives here rather than in the server action for the same reason
 * `pending-signups.ts` does: it is a substantial query and a substantial
 * amount of shaping, and neither is about authorization. The action in
 * `src/actions/member-export.ts` is the auth boundary and nothing else.
 */

import { db } from "@/lib/db";
import {
  classroomMembers,
  classrooms,
  committeeMembers,
  committeeSignups,
  committees,
  schoolMemberships,
  schools,
  users,
  volunteerCampaignEvents,
  volunteerCampaigns,
  volunteerInterests,
  volunteerSignups,
} from "@/lib/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";
import {
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_TYPES,
  ASSIGNMENT_TYPE_ORDER,
  CLASSROOM_ASSIGNMENT_TYPES,
  COMMITTEE_ASSIGNMENT_TYPES,
  columnsForFormat,
  defaultColumnsForFormat,
  type AssignmentStatus,
  type AssignmentType,
  type MemberExportColumnKey,
  type MemberExportFilters,
  type MemberExportFormat,
  type MemberExportOptions,
  type MemberExportResult,
} from "@/lib/member-export";
import { formatGradeLevel, getGradeSortOrder } from "@/lib/grade-levels";
import { ptaSourcedMemberFilter } from "@/lib/member-directory";
import { COMMITTEE_MEMBER_ROLES, SCHOOL_ROLES } from "@/lib/constants";
import { formatPhoneNumber } from "@/lib/utils";
import {
  getBoardPositionLabels,
  getBoardPositionsWithSeed,
} from "@/lib/board-positions";
import { positionLabel } from "@/lib/board-positions-shared";
import { resolveVolunteerSettings } from "@/lib/volunteer-settings";
import { getSchoolTimeZone } from "@/lib/school-time-zone";
import { formatDateInTimeZone } from "@/lib/time-zone";
import type { SchoolRole } from "@/types";

/**
 * Grade options, committees, campaign events and year context for the export
 * dialog. Reports whether the school has any classrooms for its current year so
 * the dialog can explain an empty classroom-based export instead of just
 * shrugging at it.
 */
export async function buildMemberExportOptions(
  schoolId: string
): Promise<MemberExportOptions> {

  const schoolYear = await getSchoolCurrentYear(schoolId);

  const rows = await db
    .select({ gradeLevel: classrooms.gradeLevel })
    .from(classrooms)
    .where(
      and(
        eq(classrooms.schoolId, schoolId),
        eq(classrooms.schoolYear, schoolYear),
        eq(classrooms.active, true)
      )
    );

  const distinct = [
    ...new Set(rows.map((r) => r.gradeLevel).filter((g): g is string => !!g)),
  ];

  // Include retired positions: someone exporting last year's board still needs
  // to filter by a position the school has since turned off.
  const positions = await getBoardPositionsWithSeed(schoolId, {
    includeInactive: true,
  });

  // Draft and closed committees are offered too — both have real rosters the
  // board may need to email; only archived ones drop out.
  const committeeRows = await db
    .select({ id: committees.id, name: committees.name })
    .from(committees)
    .where(
      and(
        eq(committees.schoolId, schoolId),
        eq(committees.schoolYear, schoolYear),
        isNull(committees.archivedAt)
      )
    )
    .orderBy(asc(committees.sortOrder), asc(committees.name));

  // Archived campaigns are excluded but archived *events* are not: pulling one
  // event off a live campaign leaves its volunteers behind, and they are
  // exactly who the board still needs to reach.
  const eventRows = await db
    .select({
      id: volunteerCampaignEvents.id,
      title: volunteerCampaignEvents.title,
      campaignTitle: volunteerCampaigns.title,
    })
    .from(volunteerCampaignEvents)
    .innerJoin(
      volunteerCampaigns,
      eq(volunteerCampaignEvents.campaignId, volunteerCampaigns.id)
    )
    .where(
      and(
        eq(volunteerCampaigns.schoolId, schoolId),
        eq(volunteerCampaigns.schoolYear, schoolYear),
        isNull(volunteerCampaigns.archivedAt)
      )
    )
    .orderBy(
      asc(volunteerCampaigns.title),
      asc(volunteerCampaignEvents.sortOrder),
      asc(volunteerCampaignEvents.title)
    );

  return {
    schoolYear,
    hasClassroomsForYear: rows.length > 0,
    gradeLevels: distinct
      .sort((a, b) => getGradeSortOrder(a) - getGradeSortOrder(b))
      .map((value) => ({ value, label: formatGradeLevel(value) })),
    boardPositions: positions.map((p) => ({ value: p.slug, label: p.label })),
    committees: committeeRows.map((c) => ({ value: c.id, label: c.name })),
    campaignEvents: eventRows.map((e) => ({
      value: e.id,
      label: `${e.title} (${e.campaignTitle})`,
    })),
  };
}

// ─── Internal shapes ───────────────────────────────────────────────────────

/**
 * A person in the export, keyed by lowercased email — the one identifier every
 * source table shares. Signup rows carry a name even when the account behind
 * them doesn't, which is why the export is no longer full of blank Name cells.
 */
interface PersonRecord {
  key: string;
  name: string;
  email: string;
  phone: string;
  verified: boolean;
  schoolRole: SchoolRole | null;
  boardPositionSlug: string | null;
  /**
   * Whether this person came in through a PTA door, per
   * `ptaSourcedMemberFilter()`. False only for a teacher of record who was
   * admitted by the school's own staff code: their name and school email are
   * already on the classroom record and in every export's Teacher column, but
   * their phone, school role and board position are not the PTA's to hand out.
   */
  ptaSourced: boolean;
}

/** One commitment. The unit of the assignment format, and of every filter. */
interface AssignmentRecord {
  type: AssignmentType;
  /** Null only for an unfilled seat. */
  personKey: string | null;
  /** The classroom, committee or campaign event this is a commitment to. */
  assignment: string;
  role: string;
  classroomId: string | null;
  committeeId: string | null;
  campaignEventId: string | null;
  status: AssignmentStatus;
  /** Seats are counted per pool: a room, or one room of one committee. */
  poolKey: string;
  poolLimit: number | null;
  /** Filled in after sorting, 1-based within (pool, status). */
  order: number;
  /** When they took the seat — `promotedAt` if they were promoted into it. */
  seatedAt: Date | null;
  createdAt: Date | null;
  details: string;
  notes: string;
}

const STATUS_ORDER: Record<AssignmentStatus, number> = {
  active: 0,
  waitlisted: 1,
  unfilled: 2,
};

/**
 * Build a member export for the current school. PTA board only — this returns
 * contact details for every matching member.
 *
 * Scoped by `ptaSourcedMemberFilter()` so the export matches the directory it
 * is launched from: school staff admitted by the school's own access code are
 * not the PTA's to email or hand out, and exporting them would leak contact
 * details for accounts deliberately kept off the on-screen roster.
 *
 * Assignments come from the **signup** tables, not from `classroom_members` /
 * `committee_members`. Those are authorization tables: one row per
 * (classroom, user) with a single role, written only for people who both hold
 * an account and hold a seat. Reading them is what made a Meet the Masters
 * volunteer indistinguishable from a party volunteer, and made every waitlisted
 * room parent vanish from the export entirely.
 */
export async function buildMemberExport(
  schoolId: string,
  filters: MemberExportFilters
): Promise<MemberExportResult> {

  const format: MemberExportFormat = filters.format ?? "member";
  const schoolYear = await getSchoolCurrentYear(schoolId);
  const boardPositionLabels = await getBoardPositionLabels(schoolId);
  const timeZone = await getSchoolTimeZone(schoolId);

  const [school] = await db
    .select({ volunteerSettings: schools.volunteerSettings })
    .from(schools)
    .where(eq(schools.id, schoolId));
  const volunteerSettings = resolveVolunteerSettings(school?.volunteerSettings);

  // ─── People ──────────────────────────────────────────────────────────────

  const people = new Map<string, PersonRecord>();

  /**
   * Merge what a source table knows about someone into the registry. Later,
   * richer sources fill blanks but never overwrite: the membership pass runs
   * first and is the authority on verification, role and board position.
   */
  function upsertPerson(input: {
    email: string;
    name?: string | null;
    phone?: string | null;
    verified?: boolean;
    schoolRole?: SchoolRole | null;
    boardPositionSlug?: string | null;
    ptaSourced?: boolean;
  }): PersonRecord {
    const key = input.email.trim().toLowerCase();
    const existing = people.get(key);
    if (existing) {
      if (!existing.name && input.name) existing.name = input.name;
      if (!existing.phone && input.phone) {
        existing.phone = formatPhoneNumber(input.phone);
      }
      if (input.verified) existing.verified = true;
      if (!existing.schoolRole && input.schoolRole) {
        existing.schoolRole = input.schoolRole;
      }
      if (!existing.boardPositionSlug && input.boardPositionSlug) {
        existing.boardPositionSlug = input.boardPositionSlug;
      }
      if (input.ptaSourced) existing.ptaSourced = true;
      return existing;
    }
    const created: PersonRecord = {
      key,
      name: input.name ?? "",
      email: input.email.trim(),
      phone: formatPhoneNumber(input.phone),
      verified: input.verified ?? false,
      schoolRole: input.schoolRole ?? null,
      boardPositionSlug: input.boardPositionSlug ?? null,
      ptaSourced: input.ptaSourced ?? false,
    };
    people.set(key, created);
    return created;
  }

  const memberships = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, schoolYear),
      eq(schoolMemberships.status, "approved"),
      ptaSourcedMemberFilter(schoolId)
    ),
    with: { user: true },
  });

  for (const membership of memberships) {
    upsertPerson({
      email: membership.user.email,
      name: membership.user.name,
      phone: membership.user.phone,
      verified: !!membership.user.emailVerified,
      schoolRole: membership.role,
      boardPositionSlug: membership.boardPosition,
      ptaSourced: true,
    });
  }

  // ─── Classrooms ──────────────────────────────────────────────────────────

  const classroomList = await db
    .select({
      id: classrooms.id,
      name: classrooms.name,
      gradeLevel: classrooms.gradeLevel,
      teacherEmail: classrooms.teacherEmail,
      active: classrooms.active,
      excludeFromSignup: classrooms.excludeFromSignup,
    })
    .from(classrooms)
    .where(
      and(
        eq(classrooms.schoolId, schoolId),
        eq(classrooms.schoolYear, schoolYear)
      )
    );
  const classroomById = new Map(classroomList.map((c) => [c.id, c]));

  /** Rooms an unfilled-seat sweep should consider: real, still recruiting. */
  const openClassrooms = classroomList.filter(
    (c) => c.active !== false && !c.excludeFromSignup
  );

  const teacherRows = await db
    .select({
      classroomId: classrooms.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      verified: users.emailVerified,
    })
    .from(classroomMembers)
    .innerJoin(classrooms, eq(classroomMembers.classroomId, classrooms.id))
    .innerJoin(users, eq(classroomMembers.userId, users.id))
    .where(
      and(
        eq(classrooms.schoolId, schoolId),
        eq(classrooms.schoolYear, schoolYear),
        eq(classroomMembers.role, "teacher")
      )
    );

  const teacherNameByClassroom = new Map<string, string>();
  for (const row of teacherRows) {
    if (row.name) teacherNameByClassroom.set(row.classroomId, row.name);
  }

  /** The Teacher column: the linked teacher's name, else the room's email. */
  const teacherFor = (classroomId: string | null) =>
    (classroomId &&
      (teacherNameByClassroom.get(classroomId) ??
        classroomById.get(classroomId)?.teacherEmail)) ||
    "";

  const classroomLabel = (classroomId: string | null) => {
    const classroom = classroomId ? classroomById.get(classroomId) : undefined;
    if (!classroom) return "";
    return classroom.gradeLevel
      ? `${classroom.name} (${formatGradeLevel(classroom.gradeLevel)})`
      : classroom.name;
  };

  const gradeOf = (classroomId: string | null) =>
    (classroomId ? classroomById.get(classroomId)?.gradeLevel : null) ?? null;

  // ─── Committees and campaign events ──────────────────────────────────────

  const committeeList = await db
    .select({
      id: committees.id,
      name: committees.name,
      scope: committees.scope,
      classroomId: committees.classroomId,
      perClassroomLimit: committees.perClassroomLimit,
      capacityMode: committees.capacityMode,
      maxSize: committees.maxSize,
      status: committees.status,
    })
    .from(committees)
    .where(
      and(
        eq(committees.schoolId, schoolId),
        eq(committees.schoolYear, schoolYear),
        isNull(committees.archivedAt)
      )
    );
  const committeeById = new Map(committeeList.map((c) => [c.id, c]));

  /**
   * A committee's kind decides the assignment type, not whether a given signup
   * happened to name a room. A roster-added Meet the Masters member with no
   * signup row is still a classroom committee member — with the room blank,
   * which is a fact worth seeing rather than a reason to reclassify them.
   */
  const typeForCommittee = (scope: string): AssignmentType =>
    scope === "classroom" || scope === "all_classrooms"
      ? "classroom_committee"
      : "school_committee";

  const campaignEventRows = await db
    .select({
      id: volunteerCampaignEvents.id,
      title: volunteerCampaignEvents.title,
      campaignTitle: volunteerCampaigns.title,
    })
    .from(volunteerCampaignEvents)
    .innerJoin(
      volunteerCampaigns,
      eq(volunteerCampaignEvents.campaignId, volunteerCampaigns.id)
    )
    .where(
      and(
        eq(volunteerCampaigns.schoolId, schoolId),
        eq(volunteerCampaigns.schoolYear, schoolYear)
      )
    );
  const campaignEventById = new Map(campaignEventRows.map((e) => [e.id, e]));

  // ─── Assignments ─────────────────────────────────────────────────────────

  const assignments: AssignmentRecord[] = [];

  /** Everyone holding an active seat in a pool, for the unfilled-seat sweep. */
  const activeByPool = new Map<string, number>();
  const countActive = (record: AssignmentRecord) => {
    if (record.status !== "active") return;
    activeByPool.set(record.poolKey, (activeByPool.get(record.poolKey) ?? 0) + 1);
  };
  const push = (record: AssignmentRecord) => {
    assignments.push(record);
    countActive(record);
  };

  // Classroom signups: room parents and party volunteers, active and
  // waitlisted alike. `volunteer_signups` has no school_year column — it
  // inherits the year from its classroom, so we scope through the join.
  const classroomSignups = await db
    .select({
      name: volunteerSignups.name,
      email: volunteerSignups.email,
      phone: volunteerSignups.phone,
      userId: volunteerSignups.userId,
      role: volunteerSignups.role,
      classroomId: volunteerSignups.classroomId,
      status: volunteerSignups.status,
      partyTypes: volunteerSignups.partyTypes,
      notes: volunteerSignups.notes,
      waitlistedAt: volunteerSignups.waitlistedAt,
      promotedAt: volunteerSignups.promotedAt,
      createdAt: volunteerSignups.createdAt,
    })
    .from(volunteerSignups)
    .innerJoin(classrooms, eq(volunteerSignups.classroomId, classrooms.id))
    .where(
      and(
        eq(volunteerSignups.schoolId, schoolId),
        eq(classrooms.schoolYear, schoolYear),
        inArray(volunteerSignups.status, ["active", "waitlisted"])
      )
    );

  for (const row of classroomSignups) {
    const person = upsertPerson({
      email: row.email,
      name: row.name,
      phone: row.phone,
      ptaSourced: true,
    });
    const isRoomParent = row.role === "room_parent";
    push({
      type: isRoomParent ? "room_parent" : "party_volunteer",
      personKey: person.key,
      assignment: classroomLabel(row.classroomId),
      role: isRoomParent ? "Room Parent" : "Party Volunteer",
      classroomId: row.classroomId,
      committeeId: null,
      campaignEventId: null,
      status: row.status === "waitlisted" ? "waitlisted" : "active",
      poolKey: `${row.role}:${row.classroomId}`,
      // Party volunteering has no cap and therefore no line and no gap.
      poolLimit: isRoomParent ? volunteerSettings.roomParentLimit : null,
      order: 0,
      seatedAt: row.promotedAt ?? row.createdAt,
      createdAt: row.createdAt,
      details: (row.partyTypes ?? []).join(", "),
      notes: row.notes ?? "",
    });
  }

  const committeeSignupRows = await db
    .select({
      name: committeeSignups.name,
      email: committeeSignups.email,
      phone: committeeSignups.phone,
      userId: committeeSignups.userId,
      committeeId: committeeSignups.committeeId,
      classroomId: committeeSignups.classroomId,
      role: committeeSignups.role,
      status: committeeSignups.status,
      willingToChair: committeeSignups.willingToChair,
      notes: committeeSignups.notes,
      waitlistedAt: committeeSignups.waitlistedAt,
      promotedAt: committeeSignups.promotedAt,
      createdAt: committeeSignups.createdAt,
    })
    .from(committeeSignups)
    .where(
      and(
        eq(committeeSignups.schoolId, schoolId),
        eq(committeeSignups.schoolYear, schoolYear),
        inArray(committeeSignups.status, ["active", "waitlisted"])
      )
    );

  /** Which (committee, person) pairs a signup already accounts for. */
  const signedUpCommitteeMembers = new Set<string>();

  for (const row of committeeSignupRows) {
    const committee = committeeById.get(row.committeeId);
    if (!committee) continue;
    const person = upsertPerson({
      email: row.email,
      name: row.name,
      phone: row.phone,
      ptaSourced: true,
    });
    signedUpCommitteeMembers.add(`${row.committeeId}:${person.key}`);

    const type = typeForCommittee(committee.scope);
    const classroomId =
      row.classroomId ??
      (committee.scope === "classroom" ? committee.classroomId : null);
    push({
      type,
      personKey: person.key,
      assignment: committee.name,
      role: COMMITTEE_MEMBER_ROLES[row.role] ?? row.role,
      classroomId,
      committeeId: committee.id,
      campaignEventId: null,
      status: row.status === "waitlisted" ? "waitlisted" : "active",
      // Per-classroom capacity is counted over (committee, classroom); a
      // school-wide committee counts one pool for the whole school.
      poolKey:
        type === "classroom_committee"
          ? `committee:${committee.id}:${classroomId ?? ""}`
          : `committee:${committee.id}`,
      poolLimit:
        type === "classroom_committee"
          ? committee.perClassroomLimit
          : committee.capacityMode === "capped"
            ? committee.maxSize
            : null,
      order: 0,
      seatedAt: row.promotedAt ?? row.createdAt,
      createdAt: row.createdAt,
      details: row.willingToChair ? "Willing to chair" : "",
      notes: row.notes ?? "",
    });
  }

  // Roster-added committee members: `committee_members` rows with no signup
  // behind them, which is how a chair added straight to the workspace appears.
  // Waitlisted people never reach this table, so every row here is a seat.
  const committeeMemberRows = await db
    .select({
      committeeId: committeeMembers.committeeId,
      role: committeeMembers.role,
      createdAt: committeeMembers.createdAt,
      name: users.name,
      email: users.email,
      phone: users.phone,
      verified: users.emailVerified,
    })
    .from(committeeMembers)
    .innerJoin(committees, eq(committeeMembers.committeeId, committees.id))
    .innerJoin(users, eq(committeeMembers.userId, users.id))
    .where(
      and(
        eq(committees.schoolId, schoolId),
        eq(committees.schoolYear, schoolYear),
        isNull(committees.archivedAt)
      )
    );

  for (const row of committeeMemberRows) {
    const committee = committeeById.get(row.committeeId);
    if (!committee) continue;
    const key = row.email.trim().toLowerCase();
    if (signedUpCommitteeMembers.has(`${row.committeeId}:${key}`)) continue;

    const person = upsertPerson({
      email: row.email,
      name: row.name,
      phone: row.phone,
      verified: !!row.verified,
      ptaSourced: true,
    });
    const type = typeForCommittee(committee.scope);
    const classroomId =
      committee.scope === "classroom" ? committee.classroomId : null;
    push({
      type,
      personKey: person.key,
      assignment: committee.name,
      role: COMMITTEE_MEMBER_ROLES[row.role] ?? row.role,
      classroomId,
      committeeId: committee.id,
      campaignEventId: null,
      status: "active",
      poolKey:
        type === "classroom_committee"
          ? `committee:${committee.id}:${classroomId ?? ""}`
          : `committee:${committee.id}`,
      poolLimit:
        type === "classroom_committee"
          ? committee.perClassroomLimit
          : committee.capacityMode === "capped"
            ? committee.maxSize
            : null,
      order: 0,
      seatedAt: row.createdAt,
      createdAt: row.createdAt,
      details: "Added to roster",
      notes: "",
    });
  }

  // Event volunteer interest — Red Ribbon Week, the Fun Run. Non-binding, so
  // there is no seat, no cap and no line; the useful distinction is whether
  // they offered to lead it.
  const interestRows = await db
    .select({
      name: volunteerInterests.name,
      email: volunteerInterests.email,
      phone: volunteerInterests.phone,
      campaignEventId: volunteerInterests.campaignEventId,
      interestLevel: volunteerInterests.interestLevel,
      notes: volunteerInterests.notes,
      createdAt: volunteerInterests.createdAt,
    })
    .from(volunteerInterests)
    .where(
      and(
        eq(volunteerInterests.schoolId, schoolId),
        eq(volunteerInterests.schoolYear, schoolYear),
        eq(volunteerInterests.status, "active")
      )
    );

  for (const row of interestRows) {
    const event = campaignEventById.get(row.campaignEventId);
    if (!event) continue;
    const person = upsertPerson({
      email: row.email,
      name: row.name,
      phone: row.phone,
      ptaSourced: true,
    });
    push({
      type: "event_interest",
      personKey: person.key,
      assignment: event.title,
      role: row.interestLevel === "lead" ? "Would Lead" : "Interested",
      classroomId: null,
      committeeId: null,
      campaignEventId: event.id,
      status: "active",
      poolKey: `event:${event.id}`,
      poolLimit: null,
      order: 0,
      seatedAt: row.createdAt,
      createdAt: row.createdAt,
      details: event.campaignTitle,
      notes: row.notes ?? "",
    });
  }

  // Teachers of record. Their name and school email are already on the
  // classroom row and in every export's Teacher column, so surfacing them as
  // their own assignment discloses nothing new — but a teacher admitted by the
  // school's staff code stays `ptaSourced: false`, which blanks the columns
  // that *would* be new (phone, school role, board position).
  const teacherByClassroom = new Map<string, (typeof teacherRows)[number]>();
  for (const row of teacherRows) teacherByClassroom.set(row.classroomId, row);

  for (const classroom of classroomList) {
    const linked = teacherByClassroom.get(classroom.id);
    const email = linked?.email ?? classroom.teacherEmail;
    if (!email) continue;
    const person = upsertPerson({
      email,
      name: linked?.name ?? null,
      phone: linked?.phone ?? null,
      verified: !!linked?.verified,
    });
    push({
      type: "teacher",
      personKey: person.key,
      assignment: classroomLabel(classroom.id),
      role: "Teacher",
      classroomId: classroom.id,
      committeeId: null,
      campaignEventId: null,
      status: "active",
      poolKey: `teacher:${classroom.id}`,
      poolLimit: null,
      order: 0,
      seatedAt: null,
      createdAt: null,
      details: "",
      notes: "",
    });
  }

  // A board position is a commitment too, and without it a president who runs
  // no committee and no classroom would appear in the assignment format only as
  // "No Assignment".
  for (const membership of memberships) {
    if (!membership.boardPosition) continue;
    const key = membership.user.email.trim().toLowerCase();
    push({
      type: "board_position",
      personKey: key,
      assignment:
        positionLabel(boardPositionLabels, membership.boardPosition) ??
        membership.boardPosition,
      role: "Board Member",
      classroomId: null,
      committeeId: null,
      campaignEventId: null,
      status: "active",
      poolKey: `board:${membership.boardPosition}`,
      poolLimit: null,
      order: 0,
      seatedAt: membership.createdAt ?? null,
      createdAt: membership.createdAt ?? null,
      details: "",
      notes: "",
    });
  }

  // A member holding none of the above still belongs in the assignment format —
  // otherwise "all assignments" silently omits the people the board most needs
  // to notice, the ones who joined and were never given anything to do.
  const assignedPeople = new Set(
    assignments.map((a) => a.personKey).filter((key): key is string => !!key)
  );
  for (const person of people.values()) {
    if (!person.ptaSourced || assignedPeople.has(person.key)) continue;
    push({
      type: "none",
      personKey: person.key,
      assignment: "",
      role: "",
      classroomId: null,
      committeeId: null,
      campaignEventId: null,
      status: "active",
      poolKey: `none:${person.key}`,
      poolLimit: null,
      order: 0,
      seatedAt: null,
      createdAt: null,
      details: "",
      notes: "",
    });
  }

  // ─── Unfilled seats ──────────────────────────────────────────────────────
  // Every pool with a limit, expanded to the seats nobody holds. This is what
  // turns "which rooms still need a room parent" from an absence you have to
  // notice into a row you can sort to.

  if (filters.includeUnfilledSpots) {
    const pushUnfilled = (params: {
      type: AssignmentType;
      assignment: string;
      role: string;
      classroomId: string | null;
      committeeId: string | null;
      poolKey: string;
      limit: number;
    }) => {
      const taken = activeByPool.get(params.poolKey) ?? 0;
      for (let seat = taken + 1; seat <= params.limit; seat++) {
        assignments.push({
          type: params.type,
          personKey: null,
          assignment: params.assignment,
          role: params.role,
          classroomId: params.classroomId,
          committeeId: params.committeeId,
          campaignEventId: null,
          status: "unfilled",
          poolKey: params.poolKey,
          poolLimit: params.limit,
          order: seat,
          seatedAt: null,
          createdAt: null,
          details: "",
          notes: "",
        });
      }
    };

    for (const classroom of openClassrooms) {
      pushUnfilled({
        type: "room_parent",
        assignment: classroomLabel(classroom.id),
        role: "Room Parent",
        classroomId: classroom.id,
        committeeId: null,
        poolKey: `room_parent:${classroom.id}`,
        limit: volunteerSettings.roomParentLimit,
      });
    }

    for (const committee of committeeList) {
      // A closed committee isn't recruiting, so an open seat on it is history,
      // not a gap someone should be chasing.
      if (committee.status === "closed") continue;

      if (committee.scope === "all_classrooms" && committee.perClassroomLimit) {
        for (const classroom of openClassrooms) {
          pushUnfilled({
            type: "classroom_committee",
            assignment: committee.name,
            role: "Member",
            classroomId: classroom.id,
            committeeId: committee.id,
            poolKey: `committee:${committee.id}:${classroom.id}`,
            limit: committee.perClassroomLimit,
          });
        }
        continue;
      }
      if (
        committee.scope === "classroom" &&
        committee.classroomId &&
        committee.perClassroomLimit
      ) {
        pushUnfilled({
          type: "classroom_committee",
          assignment: committee.name,
          role: "Member",
          classroomId: committee.classroomId,
          committeeId: committee.id,
          poolKey: `committee:${committee.id}:${committee.classroomId}`,
          limit: committee.perClassroomLimit,
        });
        continue;
      }
      if (committee.capacityMode === "capped" && committee.maxSize) {
        pushUnfilled({
          type: "school_committee",
          assignment: committee.name,
          role: "Member",
          classroomId: null,
          committeeId: committee.id,
          poolKey: `committee:${committee.id}`,
          limit: committee.maxSize,
        });
      }
    }
  }

  // ─── Order within each pool ──────────────────────────────────────────────
  // Active seats are ordered by when the seat was taken, so someone promoted
  // off the waitlist lands behind the person who held their spot all along —
  // not ahead of them on the strength of an older `created_at`. The line itself
  // is ordered by `waitlisted_at`, matching `waitlistQueueOrder()`.

  const byPoolStatus = new Map<string, AssignmentRecord[]>();
  for (const record of assignments) {
    if (record.status === "unfilled") continue;
    const key = `${record.poolKey}|${record.status}`;
    const list = byPoolStatus.get(key) ?? [];
    list.push(record);
    byPoolStatus.set(key, list);
  }
  const time = (date: Date | null) => date?.getTime() ?? Number.MAX_SAFE_INTEGER;
  for (const list of byPoolStatus.values()) {
    list.sort(
      (a, b) => time(a.seatedAt) - time(b.seatedAt) || time(a.createdAt) - time(b.createdAt)
    );
    list.forEach((record, index) => {
      record.order = index + 1;
    });
  }

  // ─── Filtering ───────────────────────────────────────────────────────────

  const schoolRoles = filters.schoolRoles ?? [];
  const boardPositions = filters.boardPositions ?? [];
  const assignmentTypes = filters.assignmentTypes ?? [];
  const gradeLevels = filters.gradeLevels ?? [];
  const committeeIds = filters.committeeIds ?? [];
  const campaignEventIds = filters.campaignEventIds ?? [];
  const statuses = filters.statuses ?? [];

  /**
   * Naming a committee or a campaign event scopes the export to that kind of
   * assignment. ANDing them against every row instead would make "the Yearbook
   * Committee plus Red Ribbon Week" match nothing at all, which is never what
   * the person ticking both boxes meant.
   */
  const scopedTypes = new Set<AssignmentType>();
  if (committeeIds.length > 0) {
    for (const t of COMMITTEE_ASSIGNMENT_TYPES) scopedTypes.add(t);
  }
  if (campaignEventIds.length > 0) scopedTypes.add("event_interest");

  function personPasses(person: PersonRecord): boolean {
    if (!person.ptaSourced) return false;
    if (schoolRoles.length > 0) {
      if (!person.schoolRole || !schoolRoles.includes(person.schoolRole)) {
        return false;
      }
    }
    if (boardPositions.length > 0) {
      if (
        !person.boardPositionSlug ||
        !boardPositions.includes(person.boardPositionSlug)
      ) {
        return false;
      }
    }
    return true;
  }

  function assignmentPasses(record: AssignmentRecord): boolean {
    if (assignmentTypes.length > 0 && !assignmentTypes.includes(record.type)) {
      return false;
    }
    if (scopedTypes.size > 0 && !scopedTypes.has(record.type)) return false;
    if (
      committeeIds.length > 0 &&
      COMMITTEE_ASSIGNMENT_TYPES.includes(record.type) &&
      (!record.committeeId || !committeeIds.includes(record.committeeId))
    ) {
      return false;
    }
    if (
      campaignEventIds.length > 0 &&
      record.type === "event_interest" &&
      (!record.campaignEventId ||
        !campaignEventIds.includes(record.campaignEventId))
    ) {
      return false;
    }
    // A grade can only be satisfied by something attached to a classroom, so
    // this drops school-wide committees and event interests outright.
    if (gradeLevels.length > 0) {
      const grade = gradeOf(record.classroomId);
      if (!grade || !gradeLevels.includes(grade)) return false;
    }
    if (statuses.length > 0 && !statuses.includes(record.status)) return false;
    return true;
  }

  /**
   * `people` holds a teacher of record whose only claim on the export is the
   * classroom row, and every filter above is silent about them. `personPasses`
   * excludes them from everything except a teacher assignment, which is the
   * one row their contact details were already public on.
   */
  const teacherOnly = (person: PersonRecord) =>
    !person.ptaSourced &&
    (assignmentTypes.length === 0 || assignmentTypes.includes("teacher"));

  const matching = assignments.filter((record) => {
    if (!assignmentPasses(record)) return false;
    if (record.personKey === null) {
      // An unfilled seat has nobody to test a person filter against, so any
      // person filter excludes it rather than passing it through unchecked.
      return schoolRoles.length === 0 && boardPositions.length === 0;
    }
    const person = people.get(record.personKey);
    if (!person) return false;
    if (record.type === "teacher" && teacherOnly(person)) {
      return schoolRoles.length === 0 && boardPositions.length === 0;
    }
    return personPasses(person);
  });

  // ─── Rendering ───────────────────────────────────────────────────────────

  const columnKeys =
    filters.columns && filters.columns.length > 0
      ? filters.columns
      : defaultColumnsForFormat(format);
  const columns = columnsForFormat(format)
    .filter((c) => columnKeys.includes(c.key))
    .map((c) => ({ key: c.key, label: c.label }));

  const personCells = (person: PersonRecord | null) => {
    if (!person) {
      return {
        name: "",
        email: "",
        phone: "",
        verified: "",
        schoolRole: "",
        boardPosition: "",
      };
    }
    // Everything beyond name and email is withheld for someone who never came
    // in through a PTA door — see `PersonRecord.ptaSourced`.
    const full = person.ptaSourced;
    return {
      name: person.name,
      email: person.email,
      phone: full ? person.phone : "",
      verified: full ? (person.verified ? "Yes" : "No") : "",
      schoolRole: full
        ? person.schoolRole
          ? (SCHOOL_ROLES[person.schoolRole] ?? person.schoolRole)
          : ""
        : "",
      boardPosition: full
        ? (positionLabel(boardPositionLabels, person.boardPositionSlug) ?? "")
        : "",
    };
  };

  const emails = new Set<string>();
  const rows: Record<string, string>[] = [];

  if (format === "assignment") {
    const personName = (record: AssignmentRecord) => {
      const person = record.personKey ? people.get(record.personKey) : undefined;
      return person ? person.name || person.email : "";
    };
    const typeRank = (type: AssignmentType) =>
      ASSIGNMENT_TYPE_ORDER.indexOf(type);

    const sorted = [...matching].sort(
      (a, b) =>
        typeRank(a.type) - typeRank(b.type) ||
        a.assignment.localeCompare(b.assignment) ||
        getGradeSortOrder(gradeOf(a.classroomId)) -
          getGradeSortOrder(gradeOf(b.classroomId)) ||
        classroomLabel(a.classroomId).localeCompare(
          classroomLabel(b.classroomId)
        ) ||
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        a.order - b.order ||
        // Only reached by rows in no pool of their own — "No Assignment", and
        // board positions where two people share one. Name keeps them stable.
        personName(a).localeCompare(personName(b))
    );

    for (const record of sorted) {
      const person = record.personKey
        ? (people.get(record.personKey) ?? null)
        : null;
      if (person) emails.add(person.email);
      const classroom = record.classroomId
        ? classroomById.get(record.classroomId)
        : undefined;
      rows.push({
        ...personCells(person),
        assignmentType: ASSIGNMENT_TYPES[record.type],
        assignment: record.assignment,
        assignmentRole: record.role,
        classroom: classroom?.name ?? "",
        gradeLevel: classroom?.gradeLevel
          ? formatGradeLevel(classroom.gradeLevel)
          : "",
        teacher: teacherFor(record.classroomId),
        status: ASSIGNMENT_STATUSES[record.status],
        spotOrder: String(record.order),
        spots: record.poolLimit === null ? "" : String(record.poolLimit),
        signedUpAt: record.createdAt
          ? formatDateInTimeZone(record.createdAt, timeZone)
          : "",
        details: record.details,
        notes: record.notes,
      });
    }
  } else {
    // Member format: every assignment a person holds, grouped by kind, one row.
    const byPerson = new Map<string, AssignmentRecord[]>();
    for (const record of matching) {
      if (!record.personKey) continue;
      const list = byPerson.get(record.personKey) ?? [];
      list.push(record);
      byPerson.set(record.personKey, list);
    }

    /**
     * With no assignment filter set, the member format is a directory: everyone
     * with an approved PTA-sourced membership belongs in it, plus every parent
     * who signed up for something and never claimed their account. A filter
     * narrows it to people holding a matching assignment.
     */
    const hasAssignmentFilter =
      assignmentTypes.length > 0 ||
      gradeLevels.length > 0 ||
      committeeIds.length > 0 ||
      campaignEventIds.length > 0 ||
      statuses.length > 0;

    const candidates = [...people.values()].filter((person) => {
      if (!personPasses(person)) return false;
      if (hasAssignmentFilter) return (byPerson.get(person.key)?.length ?? 0) > 0;
      return true;
    });

    candidates.sort((a, b) =>
      (a.name || a.email).localeCompare(b.name || b.email)
    );

    const join = (values: string[]) =>
      [...new Set(values.filter(Boolean))].join("; ");

    for (const person of candidates) {
      const held = byPerson.get(person.key) ?? [];
      const of = (type: AssignmentType, status: AssignmentStatus) =>
        held.filter((r) => r.type === type && r.status === status);

      const classroomBearing = held.filter(
        (r) => r.classroomId && CLASSROOM_ASSIGNMENT_TYPES.includes(r.type)
      );

      emails.add(person.email);
      rows.push({
        ...personCells(person),
        roomParentRooms: join(
          of("room_parent", "active").map((r) => classroomLabel(r.classroomId))
        ),
        roomParentWaitlist: join(
          of("room_parent", "waitlisted").map(
            (r) => `${classroomLabel(r.classroomId)} #${r.order}`
          )
        ),
        partyVolunteerRooms: join(
          of("party_volunteer", "active").map((r) =>
            r.details
              ? `${classroomLabel(r.classroomId)} — ${r.details}`
              : classroomLabel(r.classroomId)
          )
        ),
        classroomCommittees: join(
          held
            .filter((r) => r.type === "classroom_committee")
            .map((r) => {
              const room = classroomLabel(r.classroomId);
              const where = room ? `${r.assignment} — ${room}` : r.assignment;
              if (r.status === "waitlisted") return `${where} (waitlist #${r.order})`;
              return r.role === "Chair" ? `${where} (Chair)` : where;
            })
        ),
        schoolCommittees: join(
          held
            .filter((r) => r.type === "school_committee")
            .map((r) =>
              r.status === "waitlisted"
                ? `${r.assignment} (waitlist #${r.order})`
                : `${r.assignment} (${r.role})`
            )
        ),
        eventInterests: join(
          held
            .filter((r) => r.type === "event_interest")
            .map((r) =>
              r.role === "Would Lead"
                ? `${r.assignment} (Would Lead)`
                : r.assignment
            )
        ),
        teacherOf: join(
          of("teacher", "active").map((r) => classroomLabel(r.classroomId))
        ),
        grades: [
          ...new Set(
            classroomBearing
              .map((r) => gradeOf(r.classroomId))
              .filter((g): g is string => !!g)
          ),
        ]
          .sort((a, b) => getGradeSortOrder(a) - getGradeSortOrder(b))
          .map((g) => formatGradeLevel(g))
          .join("; "),
        teachers: join(classroomBearing.map((r) => teacherFor(r.classroomId))),
      });
    }
  }

  return {
    format,
    columns,
    rows: rows as Record<MemberExportColumnKey, string>[],
    emails: [...emails],
    memberCount: emails.size,
    schoolYear,
    hasClassroomsForYear: classroomList.length > 0,
    hasCommitteesForYear: committeeById.size > 0,
    hasCampaignEventsForYear: campaignEventById.size > 0,
  };
}
