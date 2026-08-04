import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { classrooms, committees } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import {
  assertAuthenticated,
  getCurrentSchoolId,
  getSchoolAccess,
  isPtaBoardMember,
} from "@/lib/auth-helpers";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { getSentAnnouncements } from "@/actions/notifications";
import { AnnouncementComposer } from "./announcement-composer";

export const metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  const user = await assertAuthenticated();
  const access = await getSchoolAccess(user.id!, await getCurrentSchoolId());
  if (!access?.schoolId) redirect("/dashboard");
  if (!(await isPtaBoardMember(user.id!, access.schoolId))) {
    redirect("/dashboard");
  }

  const schoolId = access.schoolId;
  const year = await getSchoolCurrentYear(schoolId);

  const [committeeOptions, classroomOptions, sent] = await Promise.all([
    db
      .select({ id: committees.id, name: committees.name })
      .from(committees)
      .where(
        and(
          eq(committees.schoolId, schoolId),
          eq(committees.schoolYear, year),
          eq(committees.status, "active")
        )
      )
      .orderBy(asc(committees.name)),
    db
      .select({ id: classrooms.id, name: classrooms.name })
      .from(classrooms)
      .where(
        and(
          eq(classrooms.schoolId, schoolId),
          eq(classrooms.schoolYear, year),
          eq(classrooms.active, true)
        )
      )
      .orderBy(asc(classrooms.name)),
    getSentAnnouncements(),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Announcements</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Send a notification straight to people&apos;s phones. Use it for the
        things families actually need to know today — a cancellation, a change
        of venue, a last call for volunteers.
      </p>

      <AnnouncementComposer
        committees={committeeOptions}
        classrooms={classroomOptions}
        sent={sent}
      />
    </div>
  );
}
