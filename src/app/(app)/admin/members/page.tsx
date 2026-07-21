import { auth } from "@/lib/auth";
import {
  assertPtaBoard,
  getCurrentSchoolId,
  isSchoolAdmin,
  isSchoolAdminRole,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { classroomMembers, schoolMemberships } from "@/lib/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { getExportGradeLevels } from "@/actions/member-export";
import { MembersTable } from "./members-table";

export default async function AdminMembersPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const currentUserId = session.user.id;
  await assertPtaBoard(currentUserId);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;
  const schoolYear = await getSchoolCurrentYear(schoolId);

  // Check if current user is admin (for edit permissions)
  const canEdit = await isSchoolAdmin(currentUserId, schoolId);

  // Permanent account deletion is School Admin only — every PTA board member can
  // remove someone from the roster, but not erase their account platform-wide.
  const canDelete = await isSchoolAdminRole(currentUserId, schoolId);

  // Grade options for the export dialog's filters
  const gradeLevels = await getExportGradeLevels();

  // Get school members with their school role and board position
  const schoolMembers = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, schoolYear),
      eq(schoolMemberships.status, "approved")
    ),
    with: {
      user: true,
    },
  });

  // Get classroom data for each user
  const classroomData = await db
    .select({
      userId: classroomMembers.userId,
      classroomCount: sql<number>`count(distinct ${classroomMembers.classroomId})::int`,
      roles: sql<string>`string_agg(distinct ${classroomMembers.role}::text, ', ')`,
    })
    .from(classroomMembers)
    .groupBy(classroomMembers.userId);

  // Create a map for quick lookup
  const classroomMap = new Map(
    classroomData.map((c) => [c.userId, { count: c.classroomCount, roles: c.roles }])
  );

  // Combine the data
  const members = schoolMembers
    .map((m) => ({
      ...m,
      classroomCount: classroomMap.get(m.userId)?.count ?? 0,
      classroomRoles: classroomMap.get(m.userId)?.roles ?? null,
    }))
    .sort((a, b) => (a.user.name ?? "").localeCompare(b.user.name ?? ""));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Member Directory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All registered members and their roles. Members sign up via magic
          link. Use Export to pull a contact list into your email tool.
        </p>
      </div>

      <MembersTable
        members={members}
        schoolId={schoolId}
        currentUserId={currentUserId}
        canEdit={canEdit}
        canDelete={canDelete}
        gradeLevels={gradeLevels}
      />
    </div>
  );
}
