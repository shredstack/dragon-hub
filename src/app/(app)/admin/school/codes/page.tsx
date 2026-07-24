import { auth } from "@/lib/auth";
import { getCurrentSchoolId, isSchoolAdminRole } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";
import { listStaffJoinCodes, listPendingStaff } from "@/actions/school-admin";
import { StaffCodesClient } from "./staff-codes-client";

export default async function StaffCodesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) redirect("/dashboard");
  if (!(await isSchoolAdminRole(session.user.id, schoolId))) {
    redirect("/dashboard");
  }

  const [codes, pending] = await Promise.all([
    listStaffJoinCodes(),
    listPendingStaff(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Staff Access Codes</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Codes that let other school administrators into DragonHub. A staff
          code gives someone the run of the app — every classroom and committee
          message board included — so redeeming one puts them in a waiting list
          rather than letting them straight in. You approve them below.
        </p>
      </div>

      <StaffCodesClient
        codes={codes.map((c) => ({
          id: c.id,
          code: c.code,
          label: c.label,
          active: c.active,
          uses: c.uses,
          maxUses: c.maxUses,
          expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
        }))}
        pending={pending.map((p) => ({
          membershipId: p.membershipId,
          name: p.name,
          email: p.email,
          codeLabel: p.codeLabel,
          requestedAt: p.requestedAt ? p.requestedAt.toISOString() : null,
        }))}
      />
    </div>
  );
}
