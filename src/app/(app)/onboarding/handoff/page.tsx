import { auth } from "@/lib/auth";
import {
  assertPtaBoard,
  getCurrentSchoolId,
  getSchoolMembership,
} from "@/lib/auth-helpers";
import { getBoardPositionLabel } from "@/lib/board-positions";
import { getSchoolCurrentYear } from "@/lib/school-year";
import {
  getHandoffNotesForPosition,
  getHandoffSummary,
} from "@/actions/handoff-notes";
import { HandoffNotesPanel } from "@/components/onboarding/handoff-notes-panel";
import { HandoffSummaryCard } from "@/components/onboarding/handoff-summary-card";
import { FileText } from "lucide-react";
import type { PtaBoardPosition } from "@/types";

export default async function HandoffPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const schoolYear = await getSchoolCurrentYear(schoolId);

  // Get user's board position
  const membership = await getSchoolMembership(session.user.id, schoolId);
  const position = membership?.boardPosition as PtaBoardPosition | undefined;
  const positionLabel = await getBoardPositionLabel(schoolId, position);

  if (!position || !positionLabel) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground">
            You need a PTA board position to create handoff notes.
          </p>
        </div>
      </div>
    );
  }

  const [notes, summary] = await Promise.all([
    getHandoffNotesForPosition(position),
    getHandoffSummary(position),
  ]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Handoff Notes</h1>
            <p className="text-sm text-muted-foreground">
              {positionLabel} · {schoolYear}
            </p>
          </div>
        </div>
      </div>

      {/* Cross-year bullet summary */}
      <HandoffSummaryCard
        position={position}
        positionLabel={positionLabel}
        summary={summary}
        noteCount={notes.length}
      />

      {/* Composer + full history */}
      <HandoffNotesPanel
        notes={notes}
        positionLabel={positionLabel}
        schoolYear={schoolYear}
      />
    </div>
  );
}
