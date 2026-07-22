import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { classrooms, classroomMembers, dliGroups } from "@/lib/db/schema";
import { eq, desc, sql, and, asc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ClassroomForm } from "./classroom-form";
import { ClassroomPromote } from "./classroom-promote";
import { Settings, ChevronRight } from "lucide-react";
import { getSchoolYearConfig } from "@/lib/school-year";
import { formatGradeLevel, getGradeSortOrder } from "@/lib/grade-levels";
import { findClassroomsToPromote } from "@/lib/classroom-rollover";


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
      teacherEmail: classrooms.teacherEmail,
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

  // Group the active year's classrooms by grade level
  const classroomsByGrade = currentYearClassrooms.reduce((acc, classroom) => {
    const grade = formatGradeLevel(classroom.gradeLevel);
    if (!acc[grade]) {
      acc[grade] = [];
    }
    acc[grade].push(classroom);
    return acc;
  }, {} as Record<string, typeof allClassrooms>);

  // Sort grades by proper order
  const sortedGrades = Object.keys(classroomsByGrade).sort((a, b) => {
    const gradeA = currentYearClassrooms.find(c => formatGradeLevel(c.gradeLevel) === a)?.gradeLevel ?? null;
    const gradeB = currentYearClassrooms.find(c => formatGradeLevel(c.gradeLevel) === b)?.gradeLevel ?? null;
    return getGradeSortOrder(gradeA) - getGradeSortOrder(gradeB);
  });

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
          teacherEmail: c.teacherEmail,
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
          {sortedGrades.map((grade) => {
            const gradeClassrooms = classroomsByGrade[grade];
            const activeCount = gradeClassrooms.filter(c => c.active).length;

            return (
              <details key={grade} className="group" open>
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent/50">
                  <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                  <h2 className="font-semibold">{grade}</h2>
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
                          {c.excludeFromSignup && (
                            <Badge variant="secondary">Hidden from sign-up</Badge>
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
                            <th className="p-3">DLI</th>
                            <th className="p-3">Teacher Email</th>
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
                            {c.teacherEmail ? ` · ${c.teacherEmail}` : ""}
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
