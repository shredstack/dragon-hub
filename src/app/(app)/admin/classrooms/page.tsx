import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { classrooms, classroomMembers, dliGroups } from "@/lib/db/schema";
import { eq, desc, sql, and, asc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ClassroomForm } from "./classroom-form";
import { Settings } from "lucide-react";

export default async function AdminClassroomsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();

  // Get DLI groups for the form dropdown
  const dliGroupsList = schoolId
    ? await db.query.dliGroups.findMany({
        where: and(eq(dliGroups.schoolId, schoolId), eq(dliGroups.active, true)),
        orderBy: [asc(dliGroups.sortOrder), asc(dliGroups.name)],
      })
    : [];

  const allClassrooms = await db
    .select({
      id: classrooms.id,
      name: classrooms.name,
      gradeLevel: classrooms.gradeLevel,
      teacherEmail: classrooms.teacherEmail,
      schoolYear: classrooms.schoolYear,
      active: classrooms.active,
      isDli: classrooms.isDli,
      dliGroupId: classrooms.dliGroupId,
      dliGroupName: dliGroups.name,
      dliGroupColor: dliGroups.color,
      memberCount: sql<number>`count(${classroomMembers.id})::int`,
    })
    .from(classrooms)
    .leftJoin(classroomMembers, eq(classrooms.id, classroomMembers.classroomId))
    .leftJoin(dliGroups, eq(classrooms.dliGroupId, dliGroups.id))
    .groupBy(classrooms.id, dliGroups.id)
    .orderBy(desc(classrooms.schoolYear), classrooms.name);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Manage Classrooms</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/dli-groups"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <Settings className="h-4 w-4" />
            DLI Groups
          </Link>
          <ClassroomForm dliGroups={dliGroupsList} />
        </div>
      </div>

      {allClassrooms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-muted-foreground">No classrooms yet. Create one to get started.</p>
        </div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="space-y-3 md:hidden">
            {allClassrooms.map((c) => (
              <Link
                key={c.id}
                href={`/admin/classrooms/${c.id}`}
                className="block rounded-lg border border-border bg-card p-4 hover:border-primary/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    {c.gradeLevel && (
                      <p className="text-sm text-muted-foreground">
                        Grade {c.gradeLevel}
                      </p>
                    )}
                  </div>
                  <Badge variant={c.active ? "default" : "secondary"}>
                    {c.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {c.isDli && (
                    c.dliGroupName ? (
                      <Badge
                        variant="outline"
                        style={
                          c.dliGroupColor
                            ? {
                                borderColor: c.dliGroupColor,
                                color: c.dliGroupColor,
                              }
                            : undefined
                        }
                      >
                        {c.dliGroupName}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">DLI</Badge>
                    )
                  )}
                  <span className="text-sm text-muted-foreground">
                    {c.memberCount} member{c.memberCount !== 1 && "s"}
                  </span>
                </div>
                {c.teacherEmail && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {c.teacherEmail}
                  </p>
                )}
              </Link>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden rounded-lg border border-border bg-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-3">Name</th>
                    <th className="p-3">Grade Level</th>
                    <th className="p-3">DLI</th>
                    <th className="p-3">Teacher Email</th>
                    <th className="p-3">Members</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allClassrooms.map((c) => (
                    <tr key={c.id} className="border-b border-border">
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3">{c.gradeLevel ?? "-"}</td>
                      <td className="p-3">
                        {c.isDli ? (
                          c.dliGroupName ? (
                            <Badge
                              variant="outline"
                              style={
                                c.dliGroupColor
                                  ? {
                                      borderColor: c.dliGroupColor,
                                      color: c.dliGroupColor,
                                    }
                                  : undefined
                              }
                            >
                              {c.dliGroupName}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">DLI (no group)</Badge>
                          )
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-3">{c.teacherEmail ?? "-"}</td>
                      <td className="p-3">{c.memberCount}</td>
                      <td className="p-3">
                        <Badge variant={c.active ? "default" : "secondary"}>
                          {c.active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/admin/classrooms/${c.id}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
