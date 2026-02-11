import { auth } from "@/lib/auth";
import {
  assertPtaBoard,
  getCurrentSchoolId,
  getSchoolMembership,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { onboardingGuides, boardHandoffNotes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { CURRENT_SCHOOL_YEAR, PTA_BOARD_POSITIONS } from "@/lib/constants";
import { OnboardingDashboard } from "@/components/onboarding/onboarding-dashboard";
import type { PtaBoardPosition } from "@/types";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  // Get user's board position
  const membership = await getSchoolMembership(session.user.id, schoolId);
  const position = membership?.boardPosition as PtaBoardPosition | undefined;

  // Get onboarding guide if exists
  const guide = position
    ? await db.query.onboardingGuides.findFirst({
        where: and(
          eq(onboardingGuides.schoolId, schoolId),
          eq(onboardingGuides.position, position),
          eq(onboardingGuides.schoolYear, CURRENT_SCHOOL_YEAR)
        ),
      })
    : null;

  // Get handoff note if exists
  const handoffNote = position
    ? await db.query.boardHandoffNotes.findFirst({
        where: and(
          eq(boardHandoffNotes.schoolId, schoolId),
          eq(boardHandoffNotes.position, position),
          eq(boardHandoffNotes.schoolYear, CURRENT_SCHOOL_YEAR)
        ),
        with: {
          fromUser: { columns: { name: true, email: true } },
        },
      })
    : null;

  return (
    <OnboardingDashboard
      position={position}
      positionLabel={
        position ? PTA_BOARD_POSITIONS[position] : undefined
      }
      hasGuide={guide?.status === "ready"}
      hasHandoffNote={!!handoffNote}
      handoffFromName={
        handoffNote?.fromUser?.name ?? handoffNote?.fromUser?.email ?? undefined
      }
    />
  );
}
