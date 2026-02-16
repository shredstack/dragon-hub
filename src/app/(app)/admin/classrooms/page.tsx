import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { classrooms, classroomMembers, dliGroups } from "@/lib/db/schema";
import { eq, desc, sql, and, asc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ClassroomForm } from "./classroom-form";
import { ClassroomRollover } from "./classroom-rollover";
import { Settings, ChevronRight } from "lucide-react";
import { getSchoolYearConfig, getNextSchoolYear } from "@/lib/school-year";

// Helper to parse grade level for sorting
function getGradeSortOrder(gradeLevel: string | null): number {
  if (!gradeLevel) return 999; // Unassigned goes last
  const normalized = gradeLevel.toLowerCase().trim();
  if (normalized === "k" || normalized === "kindergarten") return 0;
  if (normalized === "pre-k" || normalized === "prek") return -1;
  const numMatch = normalized.match(/^(\d+)/);
  if (numMatch) return parseInt(numMatch[1], 10);
  return 998; // Unknown grades before unassigned
}

// Helper to format grade level for display
function formatGradeLevel(gradeLevel: string | null): string {
  if (!gradeLevel) return "Unassigned";
  const normalized = gradeLevel.toLowerCase().trim();
  if (normalized === "k" || normalized === "kindergarten") return "Kindergarten";
  if (normalized === "pre-k" || normalized === "prek") return "Pre-K";
  const numMatch = normalized.match(/^(\d+)/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    const suffix = num === 1 ? "st" : num === 2 ? "nd" : num === 3 ? "rd" : "th";
    return `${num}${suffix} Grade`;
  }
  return gradeLevel; // Return as-is if no match
}

export default async function AdminClassroomsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  // Get school year configuration
  const schoolYearConfig = await getSchoolYearConfig(schoolId);

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

  const nextSchoolYear = getNextSchoolYear(schoolYearConfig.currentYear);

  // Group classrooms by grade level
  const classroomsByGrade = allClassrooms.reduce((acc, classroom) => {
    const grade = formatGradeLevel(classroom.gradeLevel);
    if (!acc[grade]) {
      acc[grade] = [];
    }
    acc[grade].push(classroom);
    return acc;
  }, {} as Record<string, typeof allClassrooms>);

  // Sort grades by proper order
  const sortedGrades = Object.keys(classroomsByGrade).sort((a, b) => {
    const gradeA = allClassrooms.find(c => formatGradeLevel(c.gradeLevel) === a)?.gradeLevel ?? null;
    const gradeB = allClassrooms.find(c => formatGradeLevel(c.gradeLevel) === b)?.gradeLevel ?? null;
    return getGradeSortOrder(gradeA) - getGradeSortOrder(gradeB);
  });

  // Prepare data for rollover component
  const classroomsForRollover = allClassrooms.map((c) => ({
    id: c.id,
    name: c.name,
    gradeLevel: c.gradeLevel,
    schoolYear: c.schoolYear,
    teacherEmail: c.teacherEmail,
    memberCount: c.memberCount,
  }));

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
          <ClassroomForm
            dliGroups={dliGroupsList}
            schoolYearOptions={schoolYearConfig.availableYears}
            currentSchoolYear={schoolYearConfig.currentYear}
          />
        </div>
      </div>

      {/* Rollover Section */}
      <ClassroomRollover
        classrooms={classroomsForRollover}
        currentSchoolYear={schoolYearConfig.currentYear}
        nextSchoolYear={nextSchoolYear}
      />

      {allClassrooms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-muted-foreground">No classrooms yet. Create one to get started.</p>
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
                              <td className="p-3 font-medium">{c.name}</td>
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
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
