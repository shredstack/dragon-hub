import { auth } from "@/lib/auth";
import { assertSuperAdmin } from "@/lib/auth-helpers";
import { RegionalResourcesManager } from "./regional-resources-manager";

export default async function SuperAdminOnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertSuperAdmin(session.user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Onboarding Resources</h1>
        <p className="text-muted-foreground">
          Configure default onboarding resources by state and district. These
          resources will be available for schools to import based on their
          location.
        </p>
      </div>

      <RegionalResourcesManager />
    </div>
  );
}
