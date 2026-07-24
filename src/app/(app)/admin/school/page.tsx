import { auth } from "@/lib/auth";
import { getCurrentSchoolId, isSchoolAdminRole } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";
import { SCHOOL_ADMIN_HUB_SECTIONS } from "@/lib/admin-nav";
import { HubSectionsFilter } from "@/components/admin/hub-sections-filter";
import { getPendingStaffCount } from "@/actions/school-admin";

/**
 * The School Admin Hub.
 *
 * Everything the PTA configures — school settings, the school year, Google
 * integrations — moved to the PTA Board Hub, because that is who maintains it.
 * What's left is what the school genuinely owns: who its administrators are,
 * how they get in, and a directory of everyone at the school.
 */
export default async function SchoolAdminHubPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) redirect("/dashboard");

  const hasAdminAccess = await isSchoolAdminRole(session.user.id, schoolId);
  if (!hasAdminAccess) redirect("/dashboard");

  const pendingCount = await getPendingStaffCount();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">School Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your school&apos;s administrators, access codes, and member directory.
        </p>
      </div>

      {pendingCount > 0 && (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm">
            <span className="font-medium">
              {pendingCount} {pendingCount === 1 ? "person is" : "people are"}{" "}
              waiting for approval.
            </span>{" "}
            Someone redeemed a staff access code and needs you to let them in —
            see Staff Access Codes below.
          </p>
        </div>
      )}

      <HubSectionsFilter sections={SCHOOL_ADMIN_HUB_SECTIONS} />
    </div>
  );
}
