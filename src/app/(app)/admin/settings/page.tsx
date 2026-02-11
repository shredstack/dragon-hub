import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { getSchoolInfo } from "@/actions/school-membership";
import { SchoolCodeManager } from "./school-code-manager";
import { SchoolInfoEditor } from "./school-info-editor";

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
        <SchoolInfoEditor
          schoolId={schoolId}
          initialData={{
            name: school.name,
            mascot: school.mascot,
            address: school.address,
            state: school.state,
            district: school.district,
          }}
        />

        <SchoolCodeManager schoolId={schoolId} currentCode={school.joinCode} />
      </div>
    </div>
  );
}
