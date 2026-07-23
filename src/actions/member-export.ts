"use server";

import {
  assertAuthenticated,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  classroomMembers,
  classrooms,
  committeeSignups,
  schoolMemberships,
  users,
  volunteerInterests,
  volunteerSignups,
} from "@/lib/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";
import {
  DEFAULT_EXPORT_COLUMNS,
  MEMBER_EXPORT_COLUMNS,
  type MemberExportColumnKey,
  type MemberExportFilters,
  type MemberExportOptions,
  type MemberExportResult,
} from "@/lib/member-export";
import { formatGradeLevel, getGradeSortOrder } from "@/lib/grade-levels";
import {
  PTA_BOARD_POSITIONS,
  SCHOOL_ROLES,
  USER_ROLES,
} from "@/lib/constants";
import { formatPhoneNumber } from "@/lib/utils";
import type { UserRole } from "@/types";

interface Assignment {
  classroomId: string;
  classroomName: string;
  gradeLevel: string | null;
  role: UserRole;
  teacher: string;
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
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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

  return {
    schoolYear,
    hasClassroomsForYear: rows.length > 0,
    gradeLevels: distinct
      .sort((a, b) => getGradeSortOrder(a) - getGradeSortOrder(b))
      .map((value) => ({ value, label: formatGradeLevel(value) })),
  };
}

/**
 * Build a member export for the current school. PTA board and school admins
 * only — this returns contact details for every matching member.
 */
export async function exportMembers(
  filters: MemberExportFilters
): Promise<MemberExportResult> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const schoolYear = await getSchoolCurrentYear(schoolId);

  const memberships = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, schoolYear),
      eq(schoolMemberships.status, "approved")
    ),
    with: { user: true },
  });

  // Classroom assignments scoped to this school and school year.
  const classroomRows = await db
    .select({
      userId: classroomMembers.userId,
      role: classroomMembers.role,
      classroomId: classrooms.id,
      classroomName: classrooms.name,
      gradeLevel: classrooms.gradeLevel,
      teacherEmail: classrooms.teacherEmail,
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

  const assignmentsByUser = new Map<string, Assignment[]>();
  for (const row of classroomRows) {
    const list = assignmentsByUser.get(row.userId) ?? [];
    list.push({
      classroomId: row.classroomId,
      classroomName: row.classroomName,
      gradeLevel: row.gradeLevel,
      role: row.role,
      teacher:
        teacherByClassroom.get(row.classroomId) ?? row.teacherEmail ?? "",
    });
    assignmentsByUser.set(row.userId, list);
  }

  const schoolRoles = filters.schoolRoles ?? [];
  const boardPositions = filters.boardPositions ?? [];
  const classroomRoles = filters.classroomRoles ?? [];
  const gradeLevels = filters.gradeLevels ?? [];
  const filtersClassrooms = classroomRoles.length > 0 || gradeLevels.length > 0;

  const columnKeys =
    filters.columns && filters.columns.length > 0
      ? filters.columns
      : DEFAULT_EXPORT_COLUMNS;
  const columns = MEMBER_EXPORT_COLUMNS.filter((c) =>
    columnKeys.includes(c.key)
  ).map((c) => ({ key: c.key as MemberExportColumnKey, label: c.label }));

  const rows: Record<MemberExportColumnKey, string>[] = [];
  const emails = new Set<string>();

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

    const base = {
      name: membership.user.name ?? "",
      email: membership.user.email,
      phone: formatPhoneNumber(membership.user.phone),
      verified: membership.user.emailVerified ? "Yes" : "No",
      schoolRole: SCHOOL_ROLES[membership.role] ?? membership.role,
      boardPosition: membership.boardPosition
        ? PTA_BOARD_POSITIONS[membership.boardPosition] ??
          membership.boardPosition
        : "",
    };

    emails.add(membership.user.email);

    const sortedAssignments = [...matching].sort(
      (a, b) => getGradeSortOrder(a.gradeLevel) - getGradeSortOrder(b.gradeLevel)
    );

    if (filters.rowPerClassroom && sortedAssignments.length > 0) {
      for (const a of sortedAssignments) {
        rows.push({
          ...base,
          classroomRole: USER_ROLES[a.role] ?? a.role,
          classroom: a.classroomName,
          gradeLevel: formatGradeLevel(a.gradeLevel),
          teacher: a.teacher,
        });
      }
    } else {
      const unique = (values: string[]) =>
        [...new Set(values.filter(Boolean))].join("; ");
      rows.push({
        ...base,
        classroomRole: unique(
          sortedAssignments.map((a) => USER_ROLES[a.role] ?? a.role)
        ),
        classroom: unique(sortedAssignments.map((a) => a.classroomName)),
        gradeLevel: unique(
          sortedAssignments.map((a) => formatGradeLevel(a.gradeLevel))
        ),
        teacher: unique(sortedAssignments.map((a) => a.teacher)),
      });
    }
  }

  // Unverified signups: people who put their hand up but never clicked their
  // sign-in link, so they have no membership and are missing from the loop
  // above. Include them so a group email actually reaches everyone. They carry
  // no school role / board position / classroom-member assignment, so we only
  // add them to unfiltered exports or to a classroom-role filter their signup
  // type satisfies (room parent / party volunteer).
  const canIncludePending =
    schoolRoles.length === 0 &&
    boardPositions.length === 0 &&
    gradeLevels.length === 0;
  if (canIncludePending) {
    const seenLower = new Set([...emails].map((e) => e.toLowerCase()));
    const pending = await pendingExportRows(schoolId, schoolYear);
    for (const p of pending) {
      if (seenLower.has(p.email)) continue;
      if (classroomRoles.length > 0) {
        const matches = classroomRoles.some(
          (r) =>
            (r === "room_parent" && p.types.has("room_parent")) ||
            (r === "volunteer" && p.types.has("party_volunteer"))
        );
        if (!matches) continue;
      }
      rows.push({
        name: p.name ?? "",
        email: p.email,
        phone: formatPhoneNumber(p.phone),
        verified: "No",
        schoolRole: "",
        boardPosition: "",
        classroomRole: p.sourceLabels.join("; "),
        classroom: "",
        gradeLevel: "",
        teacher: "",
      });
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
    hasClassroomsForYear: classroomRows.length > 0,
  };
}

type PendingType = "room_parent" | "party_volunteer" | "campaign" | "committee";

const PENDING_SOURCE_LABELS: Record<PendingType, string> = {
  room_parent: "Room parent",
  party_volunteer: "Party volunteer",
  campaign: "Volunteer interest",
  committee: "Committee",
};

/**
 * Unverified signups (userId IS NULL across the signup tables) for a school +
 * year, grouped by lowercased email. Mirrors `getPendingMembers` but also
 * returns the typed signup roles the export needs for classroom-role filtering.
 */
async function pendingExportRows(
  schoolId: string,
  schoolYear: string
): Promise<
  {
    email: string;
    name: string | null;
    phone: string | null;
    types: Set<PendingType>;
    sourceLabels: string[];
  }[]
> {
  const classroomSignups = await db
    .select({
      name: volunteerSignups.name,
      email: volunteerSignups.email,
      phone: volunteerSignups.phone,
      role: volunteerSignups.role,
    })
    .from(volunteerSignups)
    .innerJoin(classrooms, eq(volunteerSignups.classroomId, classrooms.id))
    .where(
      and(
        eq(volunteerSignups.schoolId, schoolId),
        eq(volunteerSignups.status, "active"),
        isNull(volunteerSignups.userId),
        eq(classrooms.schoolYear, schoolYear)
      )
    );

  const campaignInterests = await db
    .select({
      name: volunteerInterests.name,
      email: volunteerInterests.email,
      phone: volunteerInterests.phone,
    })
    .from(volunteerInterests)
    .where(
      and(
        eq(volunteerInterests.schoolId, schoolId),
        eq(volunteerInterests.status, "active"),
        isNull(volunteerInterests.userId),
        eq(volunteerInterests.schoolYear, schoolYear)
      )
    );

  const committeeInterests = await db
    .select({
      name: committeeSignups.name,
      email: committeeSignups.email,
      phone: committeeSignups.phone,
    })
    .from(committeeSignups)
    .where(
      and(
        eq(committeeSignups.schoolId, schoolId),
        inArray(committeeSignups.status, ["active", "waitlisted"]),
        isNull(committeeSignups.userId),
        eq(committeeSignups.schoolYear, schoolYear)
      )
    );

  const byEmail = new Map<
    string,
    {
      email: string;
      name: string | null;
      phone: string | null;
      types: Set<PendingType>;
    }
  >();

  const add = (
    row: { name: string | null; email: string; phone: string | null },
    type: PendingType
  ) => {
    const key = row.email.trim().toLowerCase();
    const existing = byEmail.get(key);
    if (existing) {
      existing.name = existing.name ?? row.name;
      existing.phone = existing.phone ?? row.phone;
      existing.types.add(type);
      return;
    }
    byEmail.set(key, {
      email: key,
      name: row.name,
      phone: row.phone,
      types: new Set([type]),
    });
  };

  for (const row of classroomSignups) {
    add(row, row.role === "room_parent" ? "room_parent" : "party_volunteer");
  }
  for (const row of campaignInterests) add(row, "campaign");
  for (const row of committeeInterests) add(row, "committee");

  return [...byEmail.values()].map((p) => ({
    ...p,
    sourceLabels: [...p.types].map((t) => PENDING_SOURCE_LABELS[t]),
  }));
}
