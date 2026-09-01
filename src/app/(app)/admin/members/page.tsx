import { auth } from "@/lib/auth";
import {
  assertPtaBoard,
  getCurrentSchoolId,
  isPtaBoardMember,
  isSchoolAdminRole,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { classroomMembers, classrooms, schoolMemberships } from "@/lib/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { getMemberExportOptions } from "@/actions/member-export";
import { getPendingMembers } from "@/actions/pending-members";
import { directoryMemberFilter } from "@/lib/member-directory";
import { getClassroomTeachersMap } from "@/lib/classroom-teachers";
import {
  getStudentClassroomOptions,
  getStudentsForUsers,
} from "@/lib/students";
import { MembersTable, type DirectoryMember } from "./members-table";
import {
  getBoardPositionsWithSeed,
  getBoardPositionLabels,
} from "@/lib/board-positions";

export const metadata = { title: "Members" };

export default async function AdminMembersPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const currentUserId = session.user.id;
  await assertPtaBoard(currentUserId);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;
  const schoolYear = await getSchoolCurrentYear(schoolId);

  // Check if current user is admin (for edit permissions)
  const canEdit = await isPtaBoardMember(currentUserId, schoolId);

  // Permanent account deletion is School Admin only — every PTA board member can
  // remove someone from the roster, but not erase their account platform-wide.
  const canDelete = await isSchoolAdminRole(currentUserId, schoolId);

  // Grade options and year context for the export dialog
  const exportOptions = await getMemberExportOptions();
  const [boardPositionOptions, boardPositionLabels] = await Promise.all([
    getBoardPositionsWithSeed(schoolId),
    getBoardPositionLabels(schoolId),
  ]);

  // Get school members with their school role and board position.
  //
  // Scoped to people who came in through a PTA door, plus this year's teachers
  // of record — see `directoryMemberFilter`. School staff admitted by the
  // school's own access code are not the PTA's to manage and appear on the
  // School Staff roster instead; a principal who also signs up to volunteer
  // shows up here anyway, because at that point he has joined the PTA community
  // too.
  const schoolMembers = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, schoolYear),
      eq(schoolMemberships.status, "approved"),
      directoryMemberFilter(schoolId, schoolYear)
    ),
    with: {
      user: true,
    },
  });

  // Classroom roles for each user, scoped to this school and school year.
  // Without the join these counts spanned every school and every past year, so
  // the directory kept showing last year's room parents as current — and
  // disagreed with the year-scoped member export.
  const classroomData = await db
    .select({
      userId: classroomMembers.userId,
      classroomCount: sql<number>`count(distinct ${classroomMembers.classroomId})::int`,
      roles: sql<string>`string_agg(distinct ${classroomMembers.role}::text, ', ')`,
    })
    .from(classroomMembers)
    .innerJoin(classrooms, eq(classroomMembers.classroomId, classrooms.id))
    .where(
      and(
        eq(classrooms.schoolId, schoolId),
        eq(classrooms.schoolYear, schoolYear)
      )
    )
    .groupBy(classroomMembers.userId);

  // Create a map for quick lookup
  const classroomMap = new Map(
    classroomData.map((c) => [c.userId, { count: c.classroomCount, roles: c.roles }])
  );

  // The rooms a teacher teaches, named. "Teacher" alone doesn't answer the
  // question the room parent VP is actually asking, which is *whose* room — and
  // a half-day room means one teacher can hold two.
  const teacherRoomData = await db
    .select({
      userId: classroomMembers.userId,
      rooms: sql<string>`string_agg(distinct ${classrooms.name}, ', ' order by ${classrooms.name})`,
    })
    .from(classroomMembers)
    .innerJoin(classrooms, eq(classroomMembers.classroomId, classrooms.id))
    .where(
      and(
        eq(classrooms.schoolId, schoolId),
        eq(classrooms.schoolYear, schoolYear),
        eq(classroomMembers.role, "teacher")
      )
    )
    .groupBy(classroomMembers.userId);

  const teacherRoomMap = new Map(
    teacherRoomData.map((t) => [t.userId, t.rooms])
  );

  // Signups that never verified their email have no membership, so they're
  // absent from the query above. Surface them too, so the VP can see everyone
  // who put their hand up and resend their sign-in link.
  const pendingMembers = await getPendingMembers();

  // Student names, for the whole page in one query. Safe to load here and
  // nowhere else in the directory family: this page is behind `assertPtaBoard`,
  // and `/admin/school/directory` — which school admins can open — deliberately
  // does not carry them. See `src/lib/students-shared.ts`.
  const studentsByUser = await getStudentsForUsers(
    schoolId,
    schoolMembers.map((m) => m.userId)
  );

  // Verified/account members first.
  const accountRows: DirectoryMember[] = schoolMembers.map((m) => ({
    key: m.id,
    membershipId: m.id,
    userId: m.userId,
    role: m.role,
    boardPosition: m.boardPosition,
    name: m.user.name,
    email: m.user.email,
    phone: m.user.phone,
    image: m.user.image,
    classroomCount: classroomMap.get(m.userId)?.count ?? 0,
    classroomRoles: classroomMap.get(m.userId)?.roles ?? null,
    teacherRooms: teacherRoomMap.get(m.userId) ?? null,
    verified: !!m.user.emailVerified,
    pending: false,
    sources: [],
    students: studentsByUser.get(m.userId) ?? [],
  }));

  // Pending signups, minus anyone already represented by an account row.
  const accountEmails = new Set(
    accountRows.map((r) => r.email.toLowerCase())
  );
  const pendingRows: DirectoryMember[] = pendingMembers
    .filter((p) => !accountEmails.has(p.email))
    .map((p) => ({
      key: `pending:${p.email}`,
      membershipId: null,
      userId: null,
      role: null,
      boardPosition: null,
      name: p.name,
      email: p.email,
      phone: p.phone,
      image: null,
      classroomCount: 0,
      classroomRoles: null,
      teacherRooms: null,
      verified: false,
      pending: true,
      sources: p.sources,
      // A pending signup has no account, so the snapshot on the signup row is
      // the only copy of what they wrote.
      students: p.students,
    }));

  // Teachers of record who have never signed in.
  //
  // Everything above is keyed on an account or a signup row, and a teacher has
  // neither until they click a link — so at the start of a year this directory
  // (and its Teachers filter) was empty of the very people the board just typed
  // onto every classroom. The list on the classroom *is* the designation, so
  // they belong here whether or not they have claimed an account yet.
  const yearClassrooms = await db
    .select({ id: classrooms.id, name: classrooms.name })
    .from(classrooms)
    .where(
      and(
        eq(classrooms.schoolId, schoolId),
        eq(classrooms.schoolYear, schoolYear)
      )
    );
  const classroomNameById = new Map(yearClassrooms.map((c) => [c.id, c.name]));
  const listedTeachers = await getClassroomTeachersMap(
    yearClassrooms.map((c) => c.id)
  );

  const roomsByTeacherEmail = new Map<
    string,
    { name: string | null; rooms: string[] }
  >();
  for (const [classroomId, teachers] of listedTeachers) {
    const room = classroomNameById.get(classroomId);
    if (!room) continue;
    for (const teacher of teachers) {
      const key = teacher.email.trim().toLowerCase();
      const entry = roomsByTeacherEmail.get(key) ?? { name: null, rooms: [] };
      if (!entry.name && teacher.name) entry.name = teacher.name;
      entry.rooms.push(room);
      roomsByTeacherEmail.set(key, entry);
    }
  }

  // A teacher who also signed up to volunteer already has a pending row; give
  // it the teacher facts rather than listing the same address twice.
  const pendingByEmail = new Map(pendingRows.map((r) => [r.email, r]));
  const teacherRows: DirectoryMember[] = [];
  for (const [email, entry] of roomsByTeacherEmail) {
    if (accountEmails.has(email)) continue;
    const rooms = [...new Set(entry.rooms)].sort().join(", ");
    const existing = pendingByEmail.get(email);
    if (existing) {
      existing.classroomRoles = "teacher";
      existing.teacherRooms = rooms;
      if (!existing.name) existing.name = entry.name;
      continue;
    }
    teacherRows.push({
      key: `teacher:${email}`,
      membershipId: null,
      userId: null,
      role: null,
      boardPosition: null,
      name: entry.name,
      email,
      phone: null,
      image: null,
      classroomCount: 0,
      classroomRoles: "teacher",
      teacherRooms: rooms,
      verified: false,
      pending: true,
      sources: [],
      // A teacher of record has never filled in a signup form, so there is
      // nothing to show — and a teacher's own children are not the PTA's
      // business even when they attend the school.
      students: [],
    });
  }

  const studentClassrooms = await getStudentClassroomOptions(
    schoolId,
    schoolYear
  );

  const members = [...accountRows, ...pendingRows, ...teacherRows].sort((a, b) =>
    (a.name ?? a.email).localeCompare(b.name ?? b.email)
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Member Directory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who signed up — including people who haven&apos;t confirmed
          their email yet. Click a row for what they signed up for, resend a
          sign-in link, or Export to pull a contact list into your email tool.
        </p>
      </div>

      <MembersTable
        members={members}
        schoolId={schoolId}
        currentUserId={currentUserId}
        canEdit={canEdit}
        canDelete={canDelete}
        exportOptions={exportOptions}
        positions={boardPositionOptions}
        positionLabels={boardPositionLabels}
        classrooms={studentClassrooms}
      />
    </div>
  );
}
