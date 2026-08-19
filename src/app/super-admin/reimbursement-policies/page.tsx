import { auth } from "@/lib/auth";
import { assertSuperAdmin } from "@/lib/auth-helpers";
import { DEFAULT_REIMBURSEMENT_POLICY } from "@/lib/reimbursement-policy";
import { ReimbursementPoliciesManager } from "./reimbursement-policies-manager";

export default async function SuperAdminReimbursementPoliciesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertSuperAdmin(session.user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reimbursement Policies</h1>
        <p className="text-muted-foreground">
          Reimbursement rules differ by state PTA — who signs a check request,
          whether the association has to authorize it in the minutes, whether
          the state refunds sales tax. A school inherits the most specific row
          that applies to it: its district&apos;s, then its state&apos;s, then
          the national default below.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <h2 className="font-medium">National default</h2>
        <p className="text-muted-foreground">
          What a school gets when neither its district nor its state is
          configured: approval from the{" "}
          {DEFAULT_REIMBURSEMENT_POLICY.approverRoles.join(" and ")}, no minutes
          requirement, no sales tax refund report, a{" "}
          {DEFAULT_REIMBURSEMENT_POLICY.submissionWindowDays}-day substantiation
          window, and no spending cards. It is deliberately the strictest
          reading every state we researched shares, so inheriting it can only
          ever be safer than the local rule.
        </p>
      </div>

      <ReimbursementPoliciesManager />
    </div>
  );
}
