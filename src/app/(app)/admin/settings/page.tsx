import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { getSchoolInfo } from "@/actions/school-membership";
import { SchoolCodeManager } from "./school-code-manager";

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const school = await getSchoolInfo(schoolId);
  if (!school) return null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">School Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage school settings and access codes.
        </p>
      </div>

      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">School Information</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">School Name</dt>
              <dd className="font-medium">{school.name}</dd>
            </div>
            {school.mascot && (
              <div>
                <dt className="text-muted-foreground">Mascot</dt>
                <dd className="font-medium">{school.mascot}</dd>
              </div>
            )}
            {school.address && (
              <div>
                <dt className="text-muted-foreground">Address</dt>
                <dd className="font-medium">{school.address}</dd>
              </div>
            )}
          </dl>
        </div>

        <SchoolCodeManager schoolId={schoolId} currentCode={school.joinCode} />
      </div>
    </div>
  );
}
