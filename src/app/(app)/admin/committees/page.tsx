import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import {
  getCommitteeAdminList,
  getCommitteeScopeOptions,
} from "@/actions/committees";
import { CommitteeList } from "./committee-list";

export default async function AdminCommitteesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const [committees, scopeOptions] = await Promise.all([
    getCommitteeAdminList(),
    getCommitteeScopeOptions(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Committees</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Standing groups that own an ongoing job for the year — Yearbook,
          Hospitality, Box Tops. Each one gets its own join link and QR code, and
          signing up puts a parent on the roster immediately.
        </p>
      </div>

      <CommitteeList
        committees={committees}
        classroomOptions={scopeOptions.classroomOptions}
        eventPlanOptions={scopeOptions.eventPlanOptions}
      />
    </div>
  );
}
