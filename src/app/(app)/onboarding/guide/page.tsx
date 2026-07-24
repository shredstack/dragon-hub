import { auth } from "@/lib/auth";
import {
  assertPtaBoard,
  getCurrentSchoolId,
  getSchoolMembership,
} from "@/lib/auth-helpers";
import { getBoardPositionLabel } from "@/lib/board-positions";
import { getMyGuide } from "@/actions/onboarding-guides";
import { GuideContent } from "@/components/onboarding/guide-content";
import { GuideGenerator } from "@/components/onboarding/guide-generator";
import { GuideGeneratingStatus } from "@/components/onboarding/guide-generating-status";
import { Sparkles } from "lucide-react";
import type { PtaBoardPosition } from "@/types";

// startGuideGeneration returns immediately and runs the model call in the
// background via `after()`. That background work is still bound by the route's
// maxDuration, so this must comfortably exceed generation time (which scales
// with context size and can run 1-2 min once a position has real handoff notes
// and indexed documents). Pro + Fluid Compute allows up to 800s; 300s gives
// generous headroom. A run that outlives it is caught by the staleness guard in
// the guide actions and surfaced to the user as a retry.
export const maxDuration = 300;

export default async function GuidePage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const membership = await getSchoolMembership(session.user.id, schoolId);
  const position = membership?.boardPosition as PtaBoardPosition | undefined;
  const positionLabel = await getBoardPositionLabel(schoolId, position);

  if (!position) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground">
            You need a PTA board position to view the onboarding guide.
          </p>
        </div>
      </div>
    );
  }

  const { guide, content, sourcesUsed } = await getMyGuide();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-purple-500/10 p-2 text-purple-500">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AI Onboarding Guide</h1>
            <p className="text-sm text-muted-foreground">
              {positionLabel} - Personalized guide for your role
            </p>
          </div>
        </div>
      </div>

      {/* Guide Content or Generator */}
      {guide?.status === "ready" && content ? (
        <GuideContent
          guide={guide}
          content={content}
          sourcesUsed={sourcesUsed}
          positionLabel={positionLabel!}
        />
      ) : guide?.status === "generating" ? (
        <GuideGeneratingStatus
          position={position}
          startedAt={guide.generationStartedAt?.toISOString() ?? null}
        />
      ) : (
        // Covers "no guide yet" and the legacy "failed" status. A previous
        // failed attempt is not an error state the board member needs to act
        // on — it just means there's no guide yet, so show the normal empty
        // state instead of a red banner that sticks around forever.
        <div className="space-y-6">
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Sparkles className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">No guide generated yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Generate a personalized onboarding guide based on handoff notes
              from previous {positionLabel}s, knowledge base articles, and
              school resources.
            </p>
          </div>
          <GuideGenerator position={position} />
        </div>
      )}
    </div>
  );
}
