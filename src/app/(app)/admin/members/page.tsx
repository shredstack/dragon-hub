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
import { ptaSourcedMemberFilter } from "@/lib/member-directory";
import { MembersTable, type DirectoryMember } from "./members-table";
import {
  getBoardPositionsWithSeed,
  getBoardPositionLabels,
} from "@/lib/board-positions";

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
  // Scoped to people who came in through a PTA door — see
  // `ptaSourcedMemberFilter`. School staff admitted by the school's own access
  // code are not the PTA's to manage and appear on the School Staff roster
  // instead; a principal who also signs up to volunteer shows up here anyway,
  // because at that point he has joined the PTA community too.
  const schoolMembers = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, schoolYear),
      eq(schoolMemberships.status, "approved"),
      ptaSourcedMemberFilter()
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

  // Signups that never verified their email have no membership, so they're
  // absent from the query above. Surface them too, so the VP can see everyone
  // who put their hand up and resend their sign-in link.
  const pendingMembers = await getPendingMembers();

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
    verified: !!m.user.emailVerified,
    pending: false,
    sources: [],
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
      verified: false,
      pending: true,
      sources: p.sources,
    }));

  const members = [...accountRows, ...pendingRows].sort((a, b) =>
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
      />
    </div>
  );
}
