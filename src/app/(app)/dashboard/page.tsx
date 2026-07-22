import { auth } from "@/lib/auth";
import {
  getCurrentSchoolId,
  getSchoolAccess,
  isPtaBoard,
} from "@/lib/auth-helpers";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { getDashboardData } from "@/lib/dashboard-data";
import { PTA_BOARD_POSITIONS } from "@/lib/constants";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { NextSteps } from "@/components/dashboard/next-steps";
import { WeekAhead } from "@/components/dashboard/week-ahead";
import { MyClassrooms } from "@/components/dashboard/my-classrooms";
import { BoardConsole } from "@/components/dashboard/board-console";
import { QuickActions } from "@/components/dashboard/quick-actions";
import type { PtaBoardPosition } from "@/types";

/**
 * The dashboard answers "what should I do next," in the order the answer
 * matters:
 *
 *   1. Why any of this is worth doing (the school's hours, and the user's).
 *   2. What the board is blocking, if the user is on the board — their queue
 *      holds up everyone else's work, so it outranks their own to-do list.
 *   3. What this user personally owes someone.
 *   4. What's about to happen, and where their kids are.
 *
 * Every count here is scoped to the current school *and* the school's active
 * year, matching the page each panel links to. See `getDashboardData`.
 */
export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const schoolId = await getCurrentSchoolId();
  const access = await getSchoolAccess(userId, schoolId);

  // No school yet — nothing on this page has anything to scope to.
  if (!access) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
        <p className="text-lg font-semibold">Welcome to DragonHub! 🐉</p>
        <p className="mt-1 text-sm text-muted-foreground">
          You&apos;re not connected to a school yet. Ask your PTA for a join code
          to get started.
        </p>
      </div>
    );
  }

  const [schoolYear, isBoardMember] = await Promise.all([
    getSchoolCurrentYear(access.schoolId),
    isPtaBoard(userId),
  ]);

  // One instant for every "is this overdue / is this upcoming" comparison on
  // the page, so two panels can't straddle a tick and disagree.
  const now = new Date();

  const data = await getDashboardData({
    userId,
    schoolId: access.schoolId,
    schoolYear,
    isBoardMember,
    now,
  });

  const position = access.membership?.boardPosition as
    | PtaBoardPosition
    | null
    | undefined;

  return (
    <div className="space-y-6">
      <DashboardHero
        name={session.user?.name}
        schoolName={access.school.name}
        mascot={access.school.mascot}
        schoolYear={data.schoolYear}
        myApprovedHours={data.myApprovedHours}
        schoolApprovedHours={data.schoolApprovedHours}
      />

      {data.board && (
        <BoardConsole
          queue={data.board}
          positionLabel={position ? PTA_BOARD_POSITIONS[position] : undefined}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <NextSteps
          items={data.actionItems}
          pendingHours={data.pendingHours}
          now={now}
        />
        <WeekAhead events={data.upcomingEvents} />
      </div>

      <MyClassrooms
        classrooms={data.classrooms}
        schoolYear={data.schoolYear}
      />

      <QuickActions isBoardMember={isBoardMember} />
    </div>
  );
}
