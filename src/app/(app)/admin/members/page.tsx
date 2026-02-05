import { auth } from "@/lib/auth";
import { assertPtaBoard } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { users, classroomMembers } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { USER_ROLES } from "@/lib/constants";
import { MemberActions } from "./member-actions";

export default async function AdminMembersPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const currentUserId = session.user.id;
  await assertPtaBoard(currentUserId);

  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      classroomCount: sql<number>`count(distinct ${classroomMembers.classroomId})::int`,
      roles: sql<string>`string_agg(distinct ${classroomMembers.role}::text, ', ')`,
    })
    .from(users)
    .leftJoin(classroomMembers, eq(users.id, classroomMembers.userId))
    .groupBy(users.id)
    .orderBy(users.name);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Member Directory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All registered members and their roles. Members sign up via magic
          link.
        </p>
      </div>

      {allUsers.length === 0 ? (
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
                  <th className="p-3">Roles</th>
                  <th className="p-3">Classrooms</th>
                  <th className="p-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {allUsers.map((u) => (
                  <tr key={u.id} className="border-b border-border">
                    <td className="p-3 font-medium">{u.name ?? "-"}</td>
                    <td className="p-3">{u.email}</td>
                    <td className="p-3">{u.phone ?? "-"}</td>
                    <td className="p-3">
                      {u.roles ? (
                        <div className="flex flex-wrap gap-1">
                          {u.roles.split(", ").map((role) => (
                            <Badge key={role} variant="secondary">
                              {USER_ROLES[role as keyof typeof USER_ROLES] ??
                                role}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </td>
                    <td className="p-3">{u.classroomCount}</td>
                    <td className="p-3">
                      <MemberActions
                        userId={u.id}
                        userName={u.name}
                        userEmail={u.email}
                        isCurrentUser={u.id === currentUserId}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
