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
  committeeMembers,
  committeeSignups,
  committees,
  schoolMemberships,
  users,
} from "@/lib/db/schema";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";
import {
  getPendingSignups,
  PENDING_SOURCE_LABELS,
} from "@/lib/pending-signups";
import {
  DEFAULT_EXPORT_COLUMNS,
  MEMBER_EXPORT_COLUMNS,
  type MemberExportColumnKey,
  type MemberExportFilters,
  type MemberExportOptions,
  type MemberExportResult,
} from "@/lib/member-export";
import { formatGradeLevel, getGradeSortOrder } from "@/lib/grade-levels";
import { ptaSourcedMemberFilter } from "@/lib/member-directory";
import {
  COMMITTEE_MEMBER_ROLES,
  SCHOOL_ROLES,
  USER_ROLES,
} from "@/lib/constants";
import { formatPhoneNumber } from "@/lib/utils";
import {
  getBoardPositionLabels,
  getBoardPositionsWithSeed,
} from "@/lib/board-positions";
import { positionLabel } from "@/lib/board-positions-shared";
import type { UserRole } from "@/types";

interface Assignment {
  classroomId: string;
  classroomName: string;
  gradeLevel: string | null;
  role: UserRole;
  teacher: string;
}

interface CommitteeAssignment {
  committeeId: string;
  committeeName: string;
  role: "chair" | "member";
  /** The room this person covers, for a per-classroom committee. */
  classroomId: string | null;
}

/**
 * Grade options and year context for the export dialog. Reports whether the
 * school has any classrooms for its current year so the dialog can explain an
 * empty classroom-based export instead of just shrugging at it.
 */
export async function getMemberExportOptions(): Promise<MemberExportOptions> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

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

  return {
    schoolYear,
    hasClassroomsForYear: rows.length > 0,
    gradeLevels: distinct
      .sort((a, b) => getGradeSortOrder(a) - getGradeSortOrder(b))
      .map((value) => ({ value, label: formatGradeLevel(value) })),
    boardPositions: positions.map((p) => ({ value: p.slug, label: p.label })),
    committees: committeeRows.map((c) => ({ value: c.id, label: c.name })),
  };
}

/**
 * Build a member export for the current school. PTA board only — this returns
 * contact details for every matching member.
 *
 * Scoped by `ptaSourcedMemberFilter()` so the export matches the directory it
 * is launched from: school staff admitted by the school's own access code are
 * not the PTA's to email or hand out, and exporting them would leak contact
 * details for accounts deliberately kept off the on-screen roster.
 */
export async function exportMembers(
  filters: MemberExportFilters
): Promise<MemberExportResult> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const schoolYear = await getSchoolCurrentYear(schoolId);
  const boardPositionLabels = await getBoardPositionLabels(schoolId);

  const memberships = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, schoolYear),
      eq(schoolMemberships.status, "approved"),
      ptaSourcedMemberFilter(schoolId)
    ),
    with: { user: true },
  });

  // Every classroom for the year, so a room can be described even when nobody
  // holds a `classroom_members` row for it yet — which is exactly the case for
  // a signup whose parent has never clicked their sign-in link.
  const classroomList = await db
    .select({
      id: classrooms.id,
      name: classrooms.name,
      gradeLevel: classrooms.gradeLevel,
      teacherEmail: classrooms.teacherEmail,
    })
    .from(classrooms)
    .where(
      and(
        eq(classrooms.schoolId, schoolId),
        eq(classrooms.schoolYear, schoolYear)
      )
    );
  const classroomById = new Map(classroomList.map((c) => [c.id, c]));

  // Classroom assignments scoped to this school and school year.
  const classroomRows = await db
    .select({
      userId: classroomMembers.userId,
      role: classroomMembers.role,
      classroomId: classrooms.id,
      memberName: users.name,
    })
    .from(classroomMembers)
    .innerJoin(classrooms, eq(classroomMembers.classroomId, classrooms.id))
    .innerJoin(users, eq(classroomMembers.userId, users.id))
    .where(
      and(
        eq(classrooms.schoolId, schoolId),
        eq(classrooms.schoolYear, schoolYear)
      )
    );

  // Teacher of record per classroom: the assigned teacher's name, falling back
  // to the classroom's teacher email when no teacher account is linked.
  const teacherByClassroom = new Map<string, string>();
  for (const row of classroomRows) {
    if (row.role === "teacher" && row.memberName) {
      teacherByClassroom.set(row.classroomId, row.memberName);
    }
  }
  const teacherFor = (classroomId: string) =>
    teacherByClassroom.get(classroomId) ??
    classroomById.get(classroomId)?.teacherEmail ??
    "";

  /** Describe a classroom for the export, from its id alone. */
  const assignmentFor = (
    classroomId: string,
    role: UserRole
  ): Assignment | null => {
    const classroom = classroomById.get(classroomId);
    if (!classroom) return null;
    return {
      classroomId,
      classroomName: classroom.name,
      gradeLevel: classroom.gradeLevel,
      role,
      teacher: teacherFor(classroomId),
    };
  };

  const assignmentsByUser = new Map<string, Assignment[]>();
  for (const row of classroomRows) {
    const assignment = assignmentFor(row.classroomId, row.role);
    if (!assignment) continue;
    const list = assignmentsByUser.get(row.userId) ?? [];
    list.push(assignment);
    assignmentsByUser.set(row.userId, list);
  }

  // This year's committees, archived ones excluded — the same slate the export
  // dialog offers as filters.
  const committeeList = await db
    .select({ id: committees.id, name: committees.name })
    .from(committees)
    .where(
      and(
        eq(committees.schoolId, schoolId),
        eq(committees.schoolYear, schoolYear),
        isNull(committees.archivedAt)
      )
    );
  const committeeById = new Map(committeeList.map((c) => [c.id, c]));

  // Committee rosters. `committee_members` is the authorization table, the
  // committee counterpart of `classroom_members`, so it decides who is on a
  // committee and in what role. The signup rows are read separately, only for
  // the classroom a per-classroom committee (Meet the Masters) is covered
  // under, which the roster table has no column for.
  const committeeRows = await db
    .select({
      userId: committeeMembers.userId,
      role: committeeMembers.role,
      committeeId: committees.id,
      committeeName: committees.name,
    })
    .from(committeeMembers)
    .innerJoin(committees, eq(committeeMembers.committeeId, committees.id))
    .where(
      and(
        eq(committees.schoolId, schoolId),
        eq(committees.schoolYear, schoolYear),
        isNull(committees.archivedAt)
      )
    );

  const signupClassroomRows = await db
    .select({
      committeeId: committeeSignups.committeeId,
      userId: committeeSignups.userId,
      classroomId: committeeSignups.classroomId,
    })
    .from(committeeSignups)
    .where(
      and(
        eq(committeeSignups.schoolId, schoolId),
        eq(committeeSignups.schoolYear, schoolYear),
        eq(committeeSignups.status, "active"),
        isNotNull(committeeSignups.userId),
        isNotNull(committeeSignups.classroomId)
      )
    );
  const signupClassroomByMember = new Map(
    signupClassroomRows.map((r) => [`${r.committeeId}:${r.userId}`, r.classroomId])
  );

  const committeesByUser = new Map<string, CommitteeAssignment[]>();
  for (const row of committeeRows) {
    const list = committeesByUser.get(row.userId) ?? [];
    list.push({
      committeeId: row.committeeId,
      committeeName: row.committeeName,
      role: row.role,
      classroomId:
        signupClassroomByMember.get(`${row.committeeId}:${row.userId}`) ?? null,
    });
    committeesByUser.set(row.userId, list);
  }

  const schoolRoles = filters.schoolRoles ?? [];
  const boardPositions = filters.boardPositions ?? [];
  const classroomRoles = filters.classroomRoles ?? [];
  const gradeLevels = filters.gradeLevels ?? [];
  const committeeIds = filters.committeeIds ?? [];
  const filtersClassrooms = classroomRoles.length > 0 || gradeLevels.length > 0;
  // `rowPerCommittee` filters as well as expands: see `MemberExportFilters`.
  const filtersCommittees = committeeIds.length > 0 || !!filters.rowPerCommittee;

  const columnKeys =
    filters.columns && filters.columns.length > 0
      ? filters.columns
      : DEFAULT_EXPORT_COLUMNS;
  const columns = MEMBER_EXPORT_COLUMNS.filter((c) =>
    columnKeys.includes(c.key)
  ).map((c) => ({ key: c.key as MemberExportColumnKey, label: c.label }));

  const rows: Record<MemberExportColumnKey, string>[] = [];
  const emails = new Set<string>();

  const unique = (values: string[]) =>
    [...new Set(values.filter(Boolean))].join("; ");

  const byGrade = (a: Assignment, b: Assignment) =>
    getGradeSortOrder(a.gradeLevel) - getGradeSortOrder(b.gradeLevel);

  const classroomCells = (list: Assignment[], roleFallback: string) => ({
    classroomRole:
      list.length > 0
        ? unique(list.map((a) => USER_ROLES[a.role] ?? a.role))
        : roleFallback,
    classroom: unique(list.map((a) => a.classroomName)),
    gradeLevel: unique(list.map((a) => formatGradeLevel(a.gradeLevel))),
    teacher: unique(list.map((a) => a.teacher)),
  });

  const committeeCells = (list: CommitteeAssignment[]) => ({
    committee: unique(list.map((c) => c.committeeName)),
    committeeRole: unique(list.map((c) => COMMITTEE_MEMBER_ROLES[c.role])),
  });

  const classroomOnlyCells = (a: Assignment) => ({
    classroomRole: USER_ROLES[a.role] ?? a.role,
    classroom: a.classroomName,
    gradeLevel: formatGradeLevel(a.gradeLevel),
    teacher: a.teacher,
  });

  /**
   * One person's rows. Which of the two "one row per" switches is on decides
   * how many; whichever axis isn't expanded is collapsed into a `; `-joined
   * cell so no information is lost either way.
   */
  function pushRows(
    base: Pick<
      Record<MemberExportColumnKey, string>,
      "name" | "email" | "phone" | "verified" | "schoolRole" | "boardPosition"
    >,
    assignments: Assignment[],
    committeeAssignments: CommitteeAssignment[],
    roleFallback = ""
  ) {
    const sortedAssignments = [...assignments].sort(byGrade);
    const sortedCommittees = [...committeeAssignments].sort((a, b) =>
      a.committeeName.localeCompare(b.committeeName)
    );

    if (filters.rowPerCommittee && sortedCommittees.length > 0) {
      for (const c of sortedCommittees) {
        // For a per-classroom committee (Meet the Masters), the room this
        // person signed up to cover is what the classroom columns should name
        // on that row — not every room they happen to be attached to.
        const covering = c.classroomId
          ? classroomById.get(c.classroomId)
          : undefined;
        rows.push({
          ...base,
          ...classroomCells(sortedAssignments, roleFallback),
          ...(covering
            ? {
                classroom: covering.name,
                gradeLevel: formatGradeLevel(covering.gradeLevel),
                teacher: teacherFor(covering.id),
              }
            : {}),
          committee: c.committeeName,
          committeeRole: COMMITTEE_MEMBER_ROLES[c.role],
        });
      }
      return;
    }

    if (filters.rowPerClassroom && sortedAssignments.length > 0) {
      for (const a of sortedAssignments) {
        rows.push({
          ...base,
          ...classroomOnlyCells(a),
          ...committeeCells(sortedCommittees),
        });
      }
      return;
    }

    rows.push({
      ...base,
      ...classroomCells(sortedAssignments, roleFallback),
      ...committeeCells(sortedCommittees),
    });
  }

  const sorted = [...memberships].sort((a, b) =>
    (a.user.name ?? a.user.email).localeCompare(b.user.name ?? b.user.email)
  );

  for (const membership of sorted) {
    if (schoolRoles.length > 0 && !schoolRoles.includes(membership.role)) {
      continue;
    }
    if (
      boardPositions.length > 0 &&
      (!membership.boardPosition ||
        !boardPositions.includes(membership.boardPosition))
    ) {
      continue;
    }

    const assignments = assignmentsByUser.get(membership.userId) ?? [];
    const matching = assignments.filter((a) => {
      if (classroomRoles.length > 0 && !classroomRoles.includes(a.role)) {
        return false;
      }
      if (
        gradeLevels.length > 0 &&
        (!a.gradeLevel || !gradeLevels.includes(a.gradeLevel))
      ) {
        return false;
      }
      return true;
    });

    // A classroom filter excludes members with no matching assignment.
    if (filtersClassrooms && matching.length === 0) continue;

    const memberCommittees = committeesByUser.get(membership.userId) ?? [];
    const matchingCommittees =
      committeeIds.length > 0
        ? memberCommittees.filter((c) => committeeIds.includes(c.committeeId))
        : memberCommittees;

    // Likewise for committees: a committee filter excludes anyone not on one.
    if (filtersCommittees && matchingCommittees.length === 0) continue;

    const base = {
      name: membership.user.name ?? "",
      email: membership.user.email,
      phone: formatPhoneNumber(membership.user.phone),
      verified: membership.user.emailVerified ? "Yes" : "No",
      schoolRole: SCHOOL_ROLES[membership.role] ?? membership.role,
      boardPosition:
        positionLabel(boardPositionLabels, membership.boardPosition) ?? "",
    };

    emails.add(membership.user.email);

    pushRows(base, matching, matchingCommittees);
  }

  // Unverified signups: people who put their hand up but never clicked their
  // sign-in link, so they have no membership and are missing from the loop
  // above. Include them so a group email actually reaches everyone.
  //
  // They hold no `classroom_members` or `committee_members` row — those are
  // authorization tables and there is no account to authorize yet — so their
  // classroom and committee come off the signup rows instead. Without that,
  // "export room parents" returned a name and an email and three empty columns
  // for exactly the people the room parent VP most needs to chase.
  //
  // A school role or board position filter still excludes them: a signup
  // carries neither, so no pending row could satisfy one.
  const canIncludePending =
    schoolRoles.length === 0 && boardPositions.length === 0;
  if (canIncludePending) {
    const seenLower = new Set([...emails].map((e) => e.toLowerCase()));
    const pending = await getPendingSignups(schoolId, schoolYear);
    for (const p of pending) {
      if (seenLower.has(p.email)) continue;

      const assignments = p.classrooms
        .map((c) =>
          assignmentFor(
            c.classroomId,
            c.role === "room_parent" ? "room_parent" : "volunteer"
          )
        )
        .filter((a): a is Assignment => a !== null)
        .filter((a) => {
          if (classroomRoles.length > 0 && !classroomRoles.includes(a.role)) {
            return false;
          }
          if (
            gradeLevels.length > 0 &&
            (!a.gradeLevel || !gradeLevels.includes(a.gradeLevel))
          ) {
            return false;
          }
          return true;
        });
      if (filtersClassrooms && assignments.length === 0) continue;

      const pendingCommittees = p.committees
        .map((c) => {
          const committee = committeeById.get(c.committeeId);
          if (!committee) return null;
          return {
            committeeId: c.committeeId,
            committeeName: committee.name,
            role: c.role,
            classroomId: c.classroomId,
          } satisfies CommitteeAssignment;
        })
        .filter((c): c is CommitteeAssignment => c !== null)
        .filter(
          (c) =>
            committeeIds.length === 0 || committeeIds.includes(c.committeeId)
        );
      if (filtersCommittees && pendingCommittees.length === 0) continue;

      pushRows(
        {
          name: p.name ?? "",
          email: p.email,
          phone: formatPhoneNumber(p.phone),
          verified: "No",
          schoolRole: "",
          boardPosition: "",
        },
        assignments,
        pendingCommittees,
        [...p.types].map((t) => PENDING_SOURCE_LABELS[t]).join("; ")
      );
      seenLower.add(p.email);
      emails.add(p.email);
    }
  }

  return {
    columns,
    rows,
    emails: [...emails],
    memberCount: emails.size,
    schoolYear,
    hasClassroomsForYear: classroomList.length > 0,
    hasCommitteesForYear: committeeById.size > 0,
  };
}
