import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { classrooms, classroomMembers, dliGroups } from "@/lib/db/schema";
import { eq, desc, sql, and, asc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { DliBadge } from "@/components/classrooms/dli-badge";
import { TeacherList } from "@/components/classrooms/teacher-list";
import Link from "next/link";
import { ClassroomForm } from "./classroom-form";
import { ClassroomPromote } from "./classroom-promote";
import { Settings, ChevronRight } from "lucide-react";
import { getSchoolYearConfig } from "@/lib/school-year";
import { formatGradeLevel, groupClassroomsByGrade } from "@/lib/grade-levels";
import { findClassroomsToPromote } from "@/lib/classroom-rollover";
import { getClassroomTeachersMap } from "@/lib/classroom-teachers";
import { formatTeacherNames } from "@/lib/classroom-teachers-shared";
import {
  linkedTeacherEmailsForClassrooms,
  linkedTeacherKey,
} from "@/lib/teacher-linking";


export default async function AdminClassroomsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  // Get school year configuration
  const schoolYearConfig = await getSchoolYearConfig(schoolId);
  const currentYear = schoolYearConfig.currentYear;

  // Get DLI groups for the form dropdown
  const dliGroupsList = await db.query.dliGroups.findMany({
    where: and(eq(dliGroups.schoolId, schoolId), eq(dliGroups.active, true)),
    orderBy: [asc(dliGroups.sortOrder), asc(dliGroups.name)],
  });

  const allClassrooms = await db
    .select({
      id: classrooms.id,
      name: classrooms.name,
      gradeLevel: classrooms.gradeLevel,
      schoolYear: classrooms.schoolYear,
      active: classrooms.active,
      excludeFromSignup: classrooms.excludeFromSignup,
      isDli: classrooms.isDli,
      dliGroupId: classrooms.dliGroupId,
      dliGroupName: dliGroups.name,
      dliGroupColor: dliGroups.color,
      memberCount: sql<number>`count(${classroomMembers.id})::int`,
    })
    .from(classrooms)
    .leftJoin(classroomMembers, eq(classrooms.id, classroomMembers.classroomId))
    .leftJoin(dliGroups, eq(classrooms.dliGroupId, dliGroups.id))
    .where(eq(classrooms.schoolId, schoolId))
    .groupBy(classrooms.id, dliGroups.id)
    .orderBy(desc(classrooms.schoolYear), classrooms.name);

  const teachersByClassroom = await getClassroomTeachersMap(
    allClassrooms.map((c) => c.id)
  );
  const teachersFor = (classroomId: string) =>
    teachersByClassroom.get(classroomId) ?? [];

  // Which of these addresses actually put a teacher inside the room.
  //
  // The teacher list is typed by hand and is load-bearing — it is what grants a
  // teacher their classroom (see `teacher-linking.ts`) — so a typo would
  // otherwise fail completely silently, with the board certain they had set it
  // up. This is the difference between "we told it who the teachers are" and
  // "the teachers are in the room", and it's per address: on a half-day room
  // one teacher may have signed in while the other hasn't.
  const linkedTeachers = await linkedTeacherEmailsForClassrooms(
    allClassrooms.map((c) => c.id)
  );

  const pendingEmailsFor = (classroomId: string) =>
    new Set(
      teachersFor(classroomId)
        .map((t) => t.email)
        .filter(
          (email) => !linkedTeachers.has(linkedTeacherKey(classroomId, email))
        )
    );

  // Rooms from earlier years with no row yet in the active year.
  const toPromote = await findClassroomsToPromote(db, schoolId, currentYear);

  const currentYearClassrooms = allClassrooms.filter(
    (c) => c.schoolYear === currentYear
  );
  const pastYears = [
    ...new Set(
      allClassrooms
        .filter((c) => c.schoolYear !== currentYear)
        .map((c) => c.schoolYear)
    ),
  ];

  // Group the active year's classrooms by grade level, in canonical order.
  const gradeGroups = groupClassroomsByGrade(currentYearClassrooms);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manage Classrooms</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Showing <span className="font-mono">{currentYear}</span>. Past years
            stay below as history.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/dli-groups"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <Settings className="h-4 w-4" />
            DLI Groups
          </Link>
          <ClassroomForm
            dliGroups={dliGroupsList}
            schoolYearOptions={schoolYearConfig.availableYears}
            currentSchoolYear={currentYear}
          />
        </div>
      </div>

      {/* Bring earlier years' rooms into the active year */}
      <ClassroomPromote
        classrooms={toPromote.map((c) => ({
          id: c.id,
          name: c.name,
          gradeLevel: c.gradeLevel,
          teachers: teachersFor(c.id),
          schoolYear: c.schoolYear,
        }))}
        targetYear={currentYear}
      />

      {currentYearClassrooms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-muted-foreground">
            No classrooms for {currentYear} yet. Create one, or copy last
            year&apos;s rooms forward with the button above.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {gradeGroups.map(({ key, label, classrooms: gradeClassrooms }) => {
            const activeCount = gradeClassrooms.filter(c => c.active).length;

            return (
              <details key={key} className="group" open>
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent/50">
                  <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                  <h2 className="font-semibold">{label}</h2>
                  <Badge variant="secondary" className="ml-2">
                    {gradeClassrooms.length} classroom{gradeClassrooms.length !== 1 && "s"}
                  </Badge>
                  {activeCount !== gradeClassrooms.length && (
                    <span className="text-xs text-muted-foreground">
                      ({activeCount} active)
                    </span>
                  )}
                </summary>

                <div className="mt-2 ml-6">
                  {/* Mobile card view */}
                  <div className="space-y-3 md:hidden">
                    {gradeClassrooms.map((c) => (
                      <Link
                        key={c.id}
                        href={`/admin/classrooms/${c.id}`}
                        className="block rounded-lg border border-border bg-card p-4 hover:border-primary/50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{c.name}</p>
                          </div>
                          <Badge variant={c.active ? "default" : "secondary"}>
                            {c.active ? "Active" : "Archived"}
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <DliBadge
                            isDli={c.isDli}
                            groupName={c.dliGroupName}
                            groupColor={c.dliGroupColor}
                          />
                          {c.excludeFromSignup && (
                            <Badge variant="secondary">Hidden from sign-up</Badge>
                          )}
                          <span className="text-sm text-muted-foreground">
                            {c.memberCount} member{c.memberCount !== 1 && "s"}
                          </span>
                        </div>
                        {teachersFor(c.id).length > 0 && (
                          <TeacherList
                            teachers={teachersFor(c.id)}
                            pendingEmails={pendingEmailsFor(c.id)}
                            showEmail
                            className="mt-2 space-y-0.5 text-xs text-muted-foreground"
                          />
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
                            <th className="p-3">DLI</th>
                            <th className="p-3">Teachers</th>
                            <th className="p-3">Members</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gradeClassrooms.map((c) => (
                            <tr key={c.id} className="border-b border-border last:border-b-0">
                              <td className="p-3 font-medium">
                                <span className="flex flex-wrap items-center gap-2">
                                  {c.name}
                                  {c.excludeFromSignup && (
                                    <Badge variant="secondary">
                                      Hidden from sign-up
                                    </Badge>
                                  )}
                                </span>
                              </td>
                              <td className="p-3">
                                {c.isDli ? (
                                  <DliBadge
                                    isDli={c.isDli}
                                    groupName={c.dliGroupName}
                                    groupColor={c.dliGroupColor}
                                    fallbackLabel="DLI (no group)"
                                  />
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="p-3">
                                <TeacherList
                                  teachers={teachersFor(c.id)}
                                  pendingEmails={pendingEmailsFor(c.id)}
                                  showEmail
                                  className="space-y-1"
                                />
                              </td>
                              <td className="p-3">{c.memberCount}</td>
                              <td className="p-3">
                                <Badge variant={c.active ? "default" : "secondary"}>
                                  {c.active ? "Active" : "Archived"}
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
                </div>
              </details>
            );
          })}
        </div>
      )}

      {/* Past years — kept as history, one collapsed section per year */}
      {pastYears.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Past years</h2>
          <div className="space-y-3">
            {pastYears.map((year) => {
              const yearClassrooms = allClassrooms.filter(
                (c) => c.schoolYear === year
              );
              return (
                <details key={year} className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent/50">
                    <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                    <span className="font-mono font-semibold">{year}</span>
                    <Badge variant="secondary" className="ml-2">
                      {yearClassrooms.length} classroom
                      {yearClassrooms.length !== 1 && "s"}
                    </Badge>
                  </summary>
                  <div className="mt-2 ml-6 space-y-2">
                    {yearClassrooms.map((c) => (
                      <Link
                        key={c.id}
                        href={`/admin/classrooms/${c.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm hover:border-primary/50"
                      >
                        <span className="font-medium">
                          {c.name}{" "}
                          <span className="font-normal text-muted-foreground">
                            {formatGradeLevel(c.gradeLevel)}
                            {teachersFor(c.id).length > 0
                              ? ` · ${formatTeacherNames(teachersFor(c.id))}`
                              : ""}
                          </span>
                        </span>
                        <span className="text-muted-foreground">
                          {c.memberCount} member{c.memberCount !== 1 && "s"}
                        </span>
                      </Link>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
