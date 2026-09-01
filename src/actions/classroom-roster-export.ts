"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { classroomMembers, classrooms, schools } from "@/lib/db/schema";
import {
  assertAuthenticated,
  isPtaBoardMember,
  isSchoolLeadership,
} from "@/lib/auth-helpers";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { buildMemberExport } from "@/lib/member-export-data";
import { buildClassroomRosterFilters } from "@/lib/classroom-roster-export";
import type { ClassroomRosterExportInput } from "@/lib/classroom-roster-export";
import type { MemberExportResult } from "@/lib/member-export";
import { buildRosterDocument, rosterDocumentIsEmpty } from "@/lib/classroom-roster-document";
import { renderRosterPdfBase64 } from "@/lib/pdf/classroom-roster-pdf";
import { formatGradeLevel } from "@/lib/grade-levels";
import { getSchoolTimeZone } from "@/lib/school-time-zone";
import { formatDateInTimeZone } from "@/lib/time-zone";
import {
  rosterPdfFileName,
  rosterPdfFilters,
  type RosterPdfResult,
} from "@/lib/classroom-roster-pdf-shared";

/**
 * Export one classroom's volunteer and teacher roster.
 *
 * The auth boundary, and nothing else — the shaping is
 * `buildClassroomRosterFilters` and the query is `buildMemberExport`, exactly
 * as the board's own export uses them.
 *
 * **Who may run it: the room's own people, plus school leadership.** A real
 * `classroom_members` row of any role is enough — a teacher, a room parent, a
 * volunteer on the roster — because everything this returns is already on the
 * classroom page they can open. Leadership passes as it does everywhere else.
 *
 * **Student names are the board's, and only if asked for.** `allowStudents`
 * below is the board check, computed here and handed to
 * `buildClassroomRosterFilters` — a room parent or a teacher exporting the same
 * roster gets the sheet without them, and a school admin does too. That is
 * stricter than the participation line school admins sit on everywhere else in
 * the app, deliberately; see `src/lib/students-shared.ts`.
 *
 * **A DLI partner deliberately does not.** A 1st grade Blue room parent can
 * read and post in 1st grade Red, and can see its volunteers on the page; that
 * grant is for coordinating a shared party, not for taking a copy of the other
 * room's contact list. The partner hop is participation, and a bulk export of
 * contact details is the point where that stops being the same thing. See the
 * DLI section in CLAUDE.md.
 */
async function assertCanExportClassroomRoster(classroomId: string) {
  const user = await assertAuthenticated();
  const userId = user.id!;

  const classroom = await db.query.classrooms.findFirst({
    where: eq(classrooms.id, classroomId),
  });
  // `classrooms.school_id` is nullable in the schema; an unattached room has no
  // school to scope an export to, and nothing to authorize against.
  if (!classroom?.schoolId) throw new Error("Classroom not found");

  const membership = await db.query.classroomMembers.findFirst({
    where: and(
      eq(classroomMembers.classroomId, classroomId),
      eq(classroomMembers.userId, userId)
    ),
  });

  if (!membership && !(await isSchoolLeadership(userId, classroom.schoolId))) {
    throw new Error("Unauthorized: Not a classroom member");
  }

  return {
    classroom,
    schoolId: classroom.schoolId,
    allowStudents: await isPtaBoardMember(userId, classroom.schoolId),
  };
}

/**
 * Whether the person opening the export dialog may be offered the student-name
 * checkbox at all. The dialog is a rendering decision; the answer that matters
 * is `allowStudents` inside the action above, which is recomputed on every
 * export rather than trusted from the request.
 */
export async function canExportClassroomRosterStudents(
  classroomId: string
): Promise<boolean> {
  const { allowStudents } = await assertCanExportClassroomRoster(classroomId);
  return allowStudents;
}

export async function exportClassroomRoster(
  classroomId: string,
  input: ClassroomRosterExportInput
): Promise<MemberExportResult> {
  const { classroom, schoolId, allowStudents } =
    await assertCanExportClassroomRoster(classroomId);
  await assertCurrentYear(classroom, schoolId);

  return buildMemberExport(
    schoolId,
    buildClassroomRosterFilters(classroomId, input, { allowStudents })
  );
}

/**
 * The export is built over the school's current year — the signups, seats and
 * waitlists it reads are all scoped to it. A room from an earlier year would
 * therefore come back empty, which is worth saying rather than reporting as
 * "nobody volunteered".
 */
async function assertCurrentYear(
  classroom: { name: string; schoolYear: string },
  schoolId: string
): Promise<string> {
  const schoolYear = await getSchoolCurrentYear(schoolId);
  if (classroom.schoolYear !== schoolYear) {
    throw new Error(
      `${classroom.name} is a ${classroom.schoolYear} classroom, and exports cover the current ${schoolYear} year.`
    );
  }
  return schoolYear;
}

/**
 * The same roster as a printable PDF — the sheet a teacher pins up or a room
 * parent attaches to a class email, rather than the spreadsheet the board
 * works in.
 *
 * Same auth boundary, same query, same withheld contact details; only the
 * shaping differs, and even that is one shared function
 * (`rosterPdfFilters`) rather than a second set of rules.
 */
export async function exportClassroomRosterPdf(
  classroomId: string,
  input: ClassroomRosterExportInput
): Promise<RosterPdfResult> {
  const { classroom, schoolId, allowStudents } =
    await assertCanExportClassroomRoster(classroomId);
  const schoolYear = await assertCurrentYear(classroom, schoolId);

  const result = await buildMemberExport(
    schoolId,
    buildClassroomRosterFilters(classroomId, rosterPdfFilters(input), {
      allowStudents,
    })
  );

  const [school] = await db
    .select({ name: schools.name })
    .from(schools)
    .where(eq(schools.id, schoolId));
  const timeZone = await getSchoolTimeZone(schoolId);

  const doc = buildRosterDocument({
    title: `${classroom.name} roster`,
    schoolName: school?.name ?? "",
    schoolYear,
    exportedOn: formatDateInTimeZone(new Date(), timeZone),
    rooms: [
      {
        id: classroomId,
        name: classroom.name,
        gradeLevel: classroom.gradeLevel
          ? formatGradeLevel(classroom.gradeLevel)
          : "",
      },
    ],
    assignments: result.assignments,
  });

  return {
    fileName: rosterPdfFileName(classroom.name),
    // An empty sheet is a real answer in September, but it isn't a download —
    // the caller turns this into the same "nobody has signed up yet" toast the
    // CSV button shows.
    base64: rosterDocumentIsEmpty(doc) ? "" : await renderRosterPdfBase64(doc),
    peopleCount: doc.rooms.reduce((sum, room) => sum + room.peopleCount, 0),
  };
}
