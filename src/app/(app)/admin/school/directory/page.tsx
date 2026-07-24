import { auth } from "@/lib/auth";
import { getCurrentSchoolId, isSchoolAdminRole } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";
import { listSchoolDirectory } from "@/actions/school-admin";
import { SchoolDirectoryClient } from "./school-directory-client";

export default async function SchoolDirectoryPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) redirect("/dashboard");
  if (!(await isSchoolAdminRole(session.user.id, schoolId))) {
    redirect("/dashboard");
  }

  const members = await listSchoolDirectory();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Member Directory</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Everyone who has joined DragonHub at this school. This list is
          read-only — managing who may stay is the PTA board&apos;s job, from
          their own hub.
        </p>
      </div>

      <SchoolDirectoryClient
        members={members.map((m) => ({
          membershipId: m.membershipId,
          name: m.name,
          email: m.email,
          role: m.role,
          positionLabel: m.positionLabel,
          joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
        }))}
      />
    </div>
  );
}
