import { auth } from "@/lib/auth";
import { assertPtaBoard } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { classrooms, classroomMembers } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ClassroomForm } from "./classroom-form";

export default async function AdminClassroomsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const allClassrooms = await db
    .select({
      id: classrooms.id,
      name: classrooms.name,
      gradeLevel: classrooms.gradeLevel,
      teacherEmail: classrooms.teacherEmail,
      schoolYear: classrooms.schoolYear,
      active: classrooms.active,
      memberCount: sql<number>`count(${classroomMembers.id})::int`,
    })
    .from(classrooms)
    .leftJoin(classroomMembers, eq(classrooms.id, classroomMembers.classroomId))
    .groupBy(classrooms.id)
    .orderBy(desc(classrooms.schoolYear), classrooms.name);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manage Classrooms</h1>
        <ClassroomForm />
      </div>

      {allClassrooms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-muted-foreground">No classrooms yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-3">Name</th>
                  <th className="p-3">Grade Level</th>
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
      )}
    </div>
  );
}
