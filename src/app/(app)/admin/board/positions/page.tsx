import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { listBoardPositions } from "@/actions/board-positions";
import { BoardPositionsClient } from "./board-positions-client";

export default async function BoardPositionsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const positions = await listBoardPositions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Board Positions</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          The positions your PTA actually runs. Rename one to match your bylaws,
          add positions the standard slate doesn&apos;t cover (a teacher
          representative, a hospitality chair), and turn off the ones you
          don&apos;t fill so they stop showing up as vacant.
        </p>
      </div>

      <BoardPositionsClient positions={positions} />
    </div>
  );
}
