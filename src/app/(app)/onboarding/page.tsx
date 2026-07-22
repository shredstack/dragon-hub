import { auth } from "@/lib/auth";
import {
  assertPtaBoard,
  getCurrentSchoolId,
  getSchoolMembership,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { onboardingGuides, boardHandoffNotes } from "@/lib/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { PTA_BOARD_POSITIONS } from "@/lib/constants";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { OnboardingDashboard } from "@/components/onboarding/onboarding-dashboard";
import type { PtaBoardPosition } from "@/types";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const schoolYear = await getSchoolCurrentYear(schoolId);

  // Get user's board position
  const membership = await getSchoolMembership(session.user.id, schoolId);
  const position = membership?.boardPosition as PtaBoardPosition | undefined;

  // Get onboarding guide if exists
  const guide = position
    ? await db.query.onboardingGuides.findFirst({
        where: and(
          eq(onboardingGuides.schoolId, schoolId),
          eq(onboardingGuides.position, position),
          eq(onboardingGuides.schoolYear, schoolYear)
        ),
      })
    : null;

  // Handoff notes accumulate across years for a position, so surface the whole
  // history here rather than only the current year's note.
  const handoffNotes = position
    ? await db.query.boardHandoffNotes.findMany({
        where: and(
          eq(boardHandoffNotes.schoolId, schoolId),
          eq(boardHandoffNotes.position, position),
          isNull(boardHandoffNotes.archivedAt)
        ),
        columns: { id: true, schoolYear: true },
        with: {
          fromUser: { columns: { name: true, email: true } },
        },
        orderBy: [
          desc(boardHandoffNotes.schoolYear),
          desc(boardHandoffNotes.updatedAt),
        ],
      })
    : [];

  const latestHandoffNote = handoffNotes[0];

  return (
    <OnboardingDashboard
      position={position}
      positionLabel={
        position ? PTA_BOARD_POSITIONS[position] : undefined
      }
      hasGuide={guide?.status === "ready"}
      handoffNoteCount={handoffNotes.length}
      handoffFromName={
        latestHandoffNote?.fromUser?.name ??
        latestHandoffNote?.fromUser?.email ??
        undefined
      }
      handoffLatestYear={latestHandoffNote?.schoolYear}
    />
  );
}
