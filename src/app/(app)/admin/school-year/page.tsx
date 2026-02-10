import { auth } from "@/lib/auth";
import { isSchoolPtaBoardOrAdmin, getCurrentSchoolId } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";
import { getSchoolYearStatus, getMembersForRenewal } from "@/actions/school-year";
import { SchoolYearManager } from "@/components/admin/school-year-manager";

export default async function SchoolYearPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) redirect("/join-school");

  const hasAccess = await isSchoolPtaBoardOrAdmin(session.user.id, schoolId);
  if (!hasAccess) redirect("/admin/overview");

  const [status, members] = await Promise.all([
    getSchoolYearStatus(),
    getMembersForRenewal(),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">School Year Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage school year transitions and member renewals.
        </p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Current School Year</p>
          <p className="mt-1 text-2xl font-bold">{status.currentSchoolYear}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Active Members</p>
          <p className="mt-1 text-2xl font-bold">{status.stats.currentYearApproved}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Current Join Code</p>
          <p className="mt-1 text-2xl font-bold font-mono">{status.currentJoinCode}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Renewed for {status.nextSchoolYear}</p>
          <p className="mt-1 text-2xl font-bold">{status.stats.nextYearRenewed}</p>
        </div>
      </div>

      <SchoolYearManager
        currentSchoolYear={status.currentSchoolYear}
        nextSchoolYear={status.nextSchoolYear}
        currentJoinCode={status.currentJoinCode}
        members={members}
        transitionStarted={status.transitionStarted}
        previousYearPending={status.stats.previousYearPending}
      />
    </div>
  );
}
