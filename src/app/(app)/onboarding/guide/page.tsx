import { auth } from "@/lib/auth";
import {
  assertPtaBoard,
  getCurrentSchoolId,
  getSchoolMembership,
} from "@/lib/auth-helpers";
import { PTA_BOARD_POSITIONS } from "@/lib/constants";
import { getMyGuide } from "@/actions/onboarding-guides";
import { GuideContent } from "@/components/onboarding/guide-content";
import { GuideGenerator } from "@/components/onboarding/guide-generator";
import { Sparkles, ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { PtaBoardPosition } from "@/types";

export default async function GuidePage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const membership = await getSchoolMembership(session.user.id, schoolId);
  const position = membership?.boardPosition as PtaBoardPosition | undefined;
  const positionLabel = position ? PTA_BOARD_POSITIONS[position] : undefined;

  if (!position) {
    return (
      <div className="space-y-6">
        <Link
          href="/onboarding"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Onboarding
        </Link>
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
        <Link
          href="/onboarding"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Onboarding
        </Link>
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
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <div className="animate-pulse">
            <Sparkles className="mx-auto h-12 w-12 text-purple-500" />
            <p className="mt-4 text-lg font-medium">
              Generating your personalized guide...
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              This may take a minute. The guide is being created based on
              handoff notes, knowledge base articles, and school resources.
            </p>
          </div>
        </div>
      ) : guide?.status === "failed" ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
            <p className="text-destructive">
              Guide generation failed. Please try again.
            </p>
          </div>
          <GuideGenerator position={position} />
        </div>
      ) : (
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
