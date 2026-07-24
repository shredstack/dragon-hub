import { auth } from "@/lib/auth";
import { getCurrentSchoolId, isSchoolAdminRole } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";
import { listSchoolAdminPositions } from "@/actions/school-admin";
import { SchoolAdminPositionsClient } from "./school-admin-positions-client";

export default async function SchoolAdminPositionsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) redirect("/dashboard");
  if (!(await isSchoolAdminRole(session.user.id, schoolId))) {
    redirect("/dashboard");
  }

  const positions = await listSchoolAdminPositions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">School Admin Roles</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          The administrative positions at your school. Rename one to match what
          your school actually calls it, add the ones this list doesn&apos;t
          cover, and turn off the ones you don&apos;t fill. These are separate
          from PTA board positions — both lists can have a &ldquo;Secretary&rdquo;
          without getting confused.
        </p>
      </div>

      <SchoolAdminPositionsClient positions={positions} />
    </div>
  );
}
