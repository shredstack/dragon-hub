import { auth } from "@/lib/auth";
import { getCurrentSchoolId, isSchoolLeadership } from "@/lib/auth-helpers";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { db } from "@/lib/db";
import { classroomMembers, classrooms } from "@/lib/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { ClassroomCard } from "@/components/classrooms/classroom-card";
import { School } from "lucide-react";

export default async function ClassroomsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const schoolId = await getCurrentSchoolId();
  const schoolYear = schoolId ? await getSchoolCurrentYear(schoolId) : null;

  // Leadership are virtual members of every classroom — they can read and post
  // in a room without a `classroom_members` row. A list built by joining that
  // table therefore shows them nothing, which is how a principal (or a board
  // member who happens not to be a room parent) ended up on an empty page
  // insisting the school had no classrooms.
  const isLeadership =
    schoolId && (await isSchoolLeadership(userId, schoolId));

  // Current year's rooms only. Each school year gets its own classroom row, so
  // an unfiltered list grows by a full set of classrooms every year — a parent
  // with a second grader would see her third grade room too.
  const myClassrooms = await db
    .select({
      id: classrooms.id,
      name: classrooms.name,
      gradeLevel: classrooms.gradeLevel,
      schoolYear: classrooms.schoolYear,
      teacherEmail: classrooms.teacherEmail,
      memberCount: sql<number>`count(${classroomMembers.id})`,
    })
    .from(classrooms)
    .innerJoin(
      classroomMembers,
      eq(classrooms.id, classroomMembers.classroomId)
    )
    .where(
      and(
        eq(classroomMembers.userId, userId),
        eq(classrooms.active, true),
        schoolYear ? eq(classrooms.schoolYear, schoolYear) : undefined
      )
    )
    .groupBy(classrooms.id);

  const myIds = new Set(myClassrooms.map((c) => c.id));

  // Every room at the school, for leadership. Left-joined so a classroom with
  // no members yet still appears — an empty room is exactly the one a room
  // parent VP needs to find.
  const allClassrooms = isLeadership
    ? await db
        .select({
          id: classrooms.id,
          name: classrooms.name,
          gradeLevel: classrooms.gradeLevel,
          schoolYear: classrooms.schoolYear,
          teacherEmail: classrooms.teacherEmail,
          memberCount: sql<number>`count(${classroomMembers.id})`,
        })
        .from(classrooms)
        .leftJoin(
          classroomMembers,
          eq(classrooms.id, classroomMembers.classroomId)
        )
        .where(
          and(
            eq(classrooms.schoolId, schoolId!),
            eq(classrooms.active, true),
            schoolYear ? eq(classrooms.schoolYear, schoolYear) : undefined
          )
        )
        .groupBy(classrooms.id)
        .orderBy(asc(classrooms.gradeLevel), asc(classrooms.name))
    : [];

  const otherClassrooms = allClassrooms.filter((c) => !myIds.has(c.id));
  const hasAnything = myClassrooms.length > 0 || otherClassrooms.length > 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Classrooms</h1>
        <p className="text-muted-foreground">
          {isLeadership
            ? "Your classrooms, and every room at the school"
            : "View and manage your classroom communities"}
        </p>
      </div>

      {!hasAnything ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16">
          <School className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-1 text-lg font-semibold">No classrooms yet</h2>
          <p className="text-sm text-muted-foreground">
            {isLeadership
              ? "No classrooms have been set up for this school year yet."
              : "You'll see classrooms here once you're added as a member."}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {myClassrooms.length > 0 && (
            <section>
              {otherClassrooms.length > 0 && (
                <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
                  My Classrooms
                </h2>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {myClassrooms.map((classroom) => (
                  <ClassroomCard
                    key={classroom.id}
                    classroom={classroom}
                    memberCount={Number(classroom.memberCount)}
                  />
                ))}
              </div>
            </section>
          )}

          {otherClassrooms.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
                {myClassrooms.length > 0 ? "All Classrooms" : "Classrooms"}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {otherClassrooms.map((classroom) => (
                  <ClassroomCard
                    key={classroom.id}
                    classroom={classroom}
                    memberCount={Number(classroom.memberCount)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
