import { auth } from "@/lib/auth";
import {
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { OnboardingAdminPanel } from "@/components/onboarding/onboarding-admin-panel";

export default async function OnboardingAdminPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  await assertSchoolPtaBoardOrAdmin(session.user.id, schoolId);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Onboarding Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage onboarding resources and checklist items for board members.
        </p>
      </div>

      <OnboardingAdminPanel />
    </div>
  );
}
