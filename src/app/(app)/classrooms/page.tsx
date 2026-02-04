import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { classroomMembers, classrooms } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { ClassroomCard } from "@/components/classrooms/classroom-card";
import { School } from "lucide-react";

export default async function ClassroomsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

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
    .where(eq(classroomMembers.userId, userId))
    .groupBy(classrooms.id);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">My Classrooms</h1>
        <p className="text-muted-foreground">
          View and manage your classroom communities
        </p>
      </div>

      {myClassrooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16">
          <School className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-1 text-lg font-semibold">No classrooms yet</h2>
          <p className="text-sm text-muted-foreground">
            You&apos;ll see classrooms here once you&apos;re added as a member.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {myClassrooms.map((classroom) => (
            <ClassroomCard
              key={classroom.id}
              classroom={classroom}
              memberCount={Number(classroom.memberCount)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
