import { auth } from "@/lib/auth";
import { getCurrentSchoolId, isSchoolLeadership } from "@/lib/auth-helpers";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { db } from "@/lib/db";
import { classroomMembers, classrooms, dliGroups } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDliPartnerRoomsForMemberships } from "@/lib/dli-partners";
import { getClassroomTeachersMap } from "@/lib/classroom-teachers";
import { ClassroomCard } from "@/components/classrooms/classroom-card";
import { GradeSection } from "@/components/classrooms/grade-section";
import {
  groupClassroomsByGrade,
  sortClassroomsByGrade,
} from "@/lib/grade-levels";
import { School } from "lucide-react";

export const metadata = { title: "Classrooms" };

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
  const myRooms = await db
    .select({
      id: classrooms.id,
      name: classrooms.name,
      gradeLevel: classrooms.gradeLevel,
      schoolYear: classrooms.schoolYear,
      iconEmoji: classrooms.iconEmoji,
      isDli: classrooms.isDli,
      dliGroupName: dliGroups.name,
      dliGroupColor: dliGroups.color,
      memberCount: sql<number>`count(${classroomMembers.id})`,
    })
    .from(classrooms)
    .innerJoin(
      classroomMembers,
      eq(classrooms.id, classroomMembers.classroomId)
    )
    .leftJoin(dliGroups, eq(classrooms.dliGroupId, dliGroups.id))
    .where(
      and(
        eq(classroomMembers.userId, userId),
        eq(classrooms.active, true),
        schoolYear ? eq(classrooms.schoolYear, schoolYear) : undefined
      )
    )
    .groupBy(classrooms.id, dliGroups.id);

  // Grade order can't be expressed in the query — see `grade-levels.ts`. Both
  // lists are one school's rooms for one year, so sorting them here is cheap.
  const myClassrooms = sortClassroomsByGrade(myRooms);

  const myIds = new Set(myClassrooms.map((c) => c.id));

  // DLI rooms come in grade pairs — 1st grade Red and 1st grade Blue — whose
  // teachers plan together and whose parents throw the parties together. A
  // member of one reaches the other, so it belongs on their page rather than
  // being something they have to be told the URL of. See `dli-partners.ts`.
  const partnerRooms = await getDliPartnerRoomsForMemberships([...myIds]);
  const myNameById = new Map(myClassrooms.map((c) => [c.id, c.name]));

  const partnerCards = partnerRooms.size
    ? await db
        .select({
          id: classrooms.id,
          name: classrooms.name,
          gradeLevel: classrooms.gradeLevel,
          schoolYear: classrooms.schoolYear,
          iconEmoji: classrooms.iconEmoji,
          isDli: classrooms.isDli,
          dliGroupName: dliGroups.name,
          dliGroupColor: dliGroups.color,
          memberCount: sql<number>`count(${classroomMembers.id})`,
        })
        .from(classrooms)
        .leftJoin(
          classroomMembers,
          eq(classrooms.id, classroomMembers.classroomId)
        )
        .leftJoin(dliGroups, eq(classrooms.dliGroupId, dliGroups.id))
        .where(inArray(classrooms.id, [...partnerRooms.keys()]))
        .groupBy(classrooms.id, dliGroups.id)
    : [];

  const myPartnerClassrooms = sortClassroomsByGrade(partnerCards);
  for (const room of myPartnerClassrooms) myIds.add(room.id);

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
          iconEmoji: classrooms.iconEmoji,
          isDli: classrooms.isDli,
          dliGroupName: dliGroups.name,
          dliGroupColor: dliGroups.color,
          memberCount: sql<number>`count(${classroomMembers.id})`,
        })
        .from(classrooms)
        .leftJoin(
          classroomMembers,
          eq(classrooms.id, classroomMembers.classroomId)
        )
        .leftJoin(dliGroups, eq(classrooms.dliGroupId, dliGroups.id))
        .where(
          and(
            eq(classrooms.schoolId, schoolId!),
            eq(classrooms.active, true),
            schoolYear ? eq(classrooms.schoolYear, schoolYear) : undefined
          )
        )
        .groupBy(classrooms.id, dliGroups.id)
    : [];

  const otherClassrooms = allClassrooms.filter((c) => !myIds.has(c.id));

  // A parent looking for their room looks for the teacher's name, and a
  // half-day room has two of them. One query for every card on the page.
  const teachersByClassroom = await getClassroomTeachersMap([
    ...myClassrooms.map((c) => c.id),
    ...myPartnerClassrooms.map((c) => c.id),
    ...otherClassrooms.map((c) => c.id),
  ]);
  const teachersFor = (classroomId: string) =>
    teachersByClassroom.get(classroomId) ?? [];

  const gradeGroups = groupClassroomsByGrade(otherClassrooms);
  const hasAnything =
    myClassrooms.length > 0 ||
    myPartnerClassrooms.length > 0 ||
    otherClassrooms.length > 0;

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
          {(myClassrooms.length > 0 || myPartnerClassrooms.length > 0) && (
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
                    teachers={teachersFor(classroom.id)}
                  />
                ))}
                {myPartnerClassrooms.map((classroom) => (
                  <ClassroomCard
                    key={classroom.id}
                    classroom={classroom}
                    memberCount={Number(classroom.memberCount)}
                    teachers={teachersFor(classroom.id)}
                    partnerOfName={
                      myNameById.get(
                        partnerRooms.get(classroom.id)!.viaClassroomId
                      ) ?? undefined
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {otherClassrooms.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
                {myClassrooms.length > 0 ? "All Classrooms" : "Classrooms"}
              </h2>
              <div className="space-y-6">
                {gradeGroups.map((group) => (
                  <GradeSection
                    key={group.key}
                    id={`classrooms:grade:${group.key}`}
                    title={group.label}
                    meta={`${group.classrooms.length} ${
                      group.classrooms.length === 1 ? "room" : "rooms"
                    }`}
                  >
                    {group.classrooms.map((classroom) => (
                      <ClassroomCard
                        key={classroom.id}
                        classroom={classroom}
                        memberCount={Number(classroom.memberCount)}
                        teachers={teachersFor(classroom.id)}
                      />
                    ))}
                  </GradeSection>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
