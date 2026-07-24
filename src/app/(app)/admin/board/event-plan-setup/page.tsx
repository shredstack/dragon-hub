import { auth } from "@/lib/auth";
import {
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { previewYearPlans, getYearAssignments, getAssignableMembers } from "@/actions/year-planning";
import { YearPlanSetup } from "./year-plan-setup";
import { getBoardPositionLabels } from "@/lib/board-positions";

/**
 * The board's August sitting: open this year's plans for every recurring event,
 * then divide them up. Both halves live on one page because they're one job —
 * you can't assign a plan that doesn't exist yet, and generating without
 * assigning leaves two dozen ownerless drafts.
 */
export default async function EventPlanSetupPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  await assertSchoolPtaBoardOrAdmin(session.user.id, schoolId);

  const [preview, assignments, members] = await Promise.all([
    previewYearPlans(),
    getYearAssignments(),
    getAssignableMembers(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Plan the Year</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open a plan for every recurring event at once, then assign who runs
          each one. Everything generated here is a draft and stays fully
          editable — dates, budgets and details are filled in by each event&rsquo;s
          leads as the year takes shape.
        </p>
      </div>

      <YearPlanSetup
        schoolYear={preview.schoolYear}
        positionLabels={await getBoardPositionLabels(schoolId)}
        candidates={preview.candidates}
        plans={assignments.plans}
        board={assignments.board}
        members={members}
      />
    </div>
  );
}
