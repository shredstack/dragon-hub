import { auth } from "@/lib/auth";
import { assertPtaBoard } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { classrooms, classroomMembers, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { USER_ROLES } from "@/lib/constants";
import { ClassroomForm } from "../classroom-form";
import { AddMemberForm } from "./add-member-form";
import { MemberActions } from "./member-actions";
import { ClassroomActions } from "./classroom-actions";

export default async function AdminClassroomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const { id } = await params;

  const classroom = await db.query.classrooms.findFirst({
    where: eq(classrooms.id, id),
  });

  if (!classroom) return notFound();

  const members = await db
    .select({
      memberId: classroomMembers.id,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      role: classroomMembers.role,
    })
    .from(classroomMembers)
    .innerJoin(users, eq(classroomMembers.userId, users.id))
    .where(eq(classroomMembers.classroomId, id))
    .orderBy(users.name);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/classrooms"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to Classrooms
        </Link>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{classroom.name}</h1>
          <p className="text-sm text-muted-foreground">
            {classroom.gradeLevel ? `Grade ${classroom.gradeLevel} - ` : ""}
            {classroom.schoolYear}
            {classroom.teacherEmail ? ` - ${classroom.teacherEmail}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ClassroomForm
            classroom={{
              id: classroom.id,
              name: classroom.name,
              gradeLevel: classroom.gradeLevel,
              teacherEmail: classroom.teacherEmail,
              schoolYear: classroom.schoolYear,
            }}
          />
          <ClassroomActions
            classroomId={classroom.id}
            classroomName={classroom.name}
          />
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Members ({members.length})
        </h2>
        <AddMemberForm classroomId={id} />
      </div>

      {members.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-muted-foreground">No members yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.memberId} className="border-b border-border">
                    <td className="p-3 font-medium">{m.userName ?? "-"}</td>
                    <td className="p-3">{m.userEmail}</td>
                    <td className="p-3">
                      <Badge variant="secondary">
                        {USER_ROLES[m.role as keyof typeof USER_ROLES] ?? m.role}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <MemberActions memberId={m.memberId} currentRole={m.role} />
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
