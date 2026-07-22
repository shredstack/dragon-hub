import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { classrooms, classroomMembers, users, dliGroups } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { USER_ROLES } from "@/lib/constants";
import { getSchoolYearConfig } from "@/lib/school-year";
import { ClassroomForm } from "../classroom-form";
import { AddMemberForm } from "./add-member-form";
import { MemberActions } from "./member-actions";
import { ClassroomActions } from "./classroom-actions";
import { getClassroomHistoryCounts } from "@/actions/classrooms";

export default async function AdminClassroomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const { id } = await params;
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return notFound();

  // Get school year configuration
  const schoolYearConfig = await getSchoolYearConfig(schoolId);

  // Scope to the current school — without the schoolId check this page renders
  // any school's classroom to anyone holding a board role at some school.
  const classroom = await db.query.classrooms.findFirst({
    where: and(eq(classrooms.id, id), eq(classrooms.schoolId, schoolId)),
    with: {
      dliGroup: true,
    },
  });

  if (!classroom) return notFound();

  // Drives whether a permanent delete is offered at all.
  const history = await getClassroomHistoryCounts(classroom.id);

  // The same room in other years, oldest first — this classroom's history.
  const lineage = await db.query.classrooms.findMany({
    where: and(
      eq(classrooms.schoolId, schoolId),
      eq(classrooms.lineageId, classroom.lineageId ?? classroom.id)
    ),
    columns: { id: true, schoolYear: true, teacherEmail: true, name: true },
    orderBy: [asc(classrooms.schoolYear)],
  });

  // Get DLI groups for the form dropdown
  const dliGroupsList = await db.query.dliGroups.findMany({
    where: and(eq(dliGroups.schoolId, schoolId), eq(dliGroups.active, true)),
    orderBy: [asc(dliGroups.sortOrder), asc(dliGroups.name)],
  });

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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{classroom.name}</h1>
            {classroom.isDli && (
              <Badge
                variant="outline"
                style={
                  classroom.dliGroup?.color
                    ? {
                        borderColor: classroom.dliGroup.color,
                        color: classroom.dliGroup.color,
                      }
                    : undefined
                }
              >
                {classroom.dliGroup?.name ?? "DLI"}
              </Badge>
            )}
          </div>
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
              excludeFromSignup: classroom.excludeFromSignup,
              isDli: classroom.isDli,
              dliGroupId: classroom.dliGroupId,
            }}
            dliGroups={dliGroupsList}
            schoolYearOptions={schoolYearConfig.availableYears}
            currentSchoolYear={schoolYearConfig.currentYear}
          />
          <ClassroomActions
            classroomId={classroom.id}
            classroomName={classroom.name}
            active={classroom.active ?? true}
            canDeletePermanently={history.isEmpty}
          />
        </div>
      </div>

      {!classroom.active && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          This classroom is archived. It stays out of volunteer sign-up, room
          parent coverage and My Classrooms, but everything below is preserved.
        </div>
      )}

      {lineage.length > 1 && (
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">This room over time</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {lineage.map((year) => (
              <Link
                key={year.id}
                href={`/admin/classrooms/${year.id}`}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  year.id === classroom.id
                    ? "border-primary bg-primary/5 font-medium"
                    : "border-border hover:border-primary/50"
                }`}
                title={year.teacherEmail ?? undefined}
              >
                <span className="font-mono">{year.schoolYear}</span>
                {year.teacherEmail && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {year.teacherEmail}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

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
