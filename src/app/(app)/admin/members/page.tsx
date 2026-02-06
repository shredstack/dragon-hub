import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId, isSchoolAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { classroomMembers, schoolMemberships } from "@/lib/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { USER_ROLES, SCHOOL_ROLES, PTA_BOARD_POSITIONS, CURRENT_SCHOOL_YEAR } from "@/lib/constants";
import { MemberActions } from "./member-actions";
import { formatPhoneNumber, getInitials } from "@/lib/utils";
import Image from "next/image";

export default async function AdminMembersPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const currentUserId = session.user.id;
  await assertPtaBoard(currentUserId);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  // Check if current user is admin (for edit permissions)
  const canEdit = await isSchoolAdmin(currentUserId, schoolId);

  // Get school members with their school role and board position
  const schoolMembers = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR),
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
          link.
        </p>
      </div>

      {members.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-muted-foreground">No members found.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">School Role</th>
                  <th className="p-3">Classroom Roles</th>
                  <th className="p-3">Classrooms</th>
                  <th className="p-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const initials = m.user.name ? getInitials(m.user.name) : m.user.email[0].toUpperCase();
                  return (
                  <tr key={m.id} className="border-b border-border">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {m.user.image ? (
                          <Image
                            src={m.user.image}
                            alt={m.user.name ?? "Profile"}
                            width={32}
                            height={32}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dragon-blue-500 text-xs font-bold text-white">
                            {initials}
                          </div>
                        )}
                        <span className="font-medium">{m.user.name ?? "-"}</span>
                      </div>
                    </td>
                    <td className="p-3">{m.user.email}</td>
                    <td className="p-3">{m.user.phone ? formatPhoneNumber(m.user.phone) : "-"}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant="secondary">
                          {SCHOOL_ROLES[m.role as keyof typeof SCHOOL_ROLES]}
                        </Badge>
                        {m.role === "pta_board" && m.boardPosition && (
                          <Badge variant="outline">
                            {PTA_BOARD_POSITIONS[m.boardPosition as keyof typeof PTA_BOARD_POSITIONS]}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      {m.classroomRoles ? (
                        <div className="flex flex-wrap gap-1">
                          {m.classroomRoles.split(", ").map((role) => (
                            <Badge key={role} variant="secondary">
                              {USER_ROLES[role as keyof typeof USER_ROLES] ?? role}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </td>
                    <td className="p-3">{m.classroomCount}</td>
                    <td className="p-3">
                      <MemberActions
                        membershipId={m.id}
                        schoolId={schoolId}
                        userId={m.userId}
                        userName={m.user.name}
                        userEmail={m.user.email}
                        currentRole={m.role}
                        currentBoardPosition={m.boardPosition}
                        isCurrentUser={m.userId === currentUserId}
                        canEdit={canEdit}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
