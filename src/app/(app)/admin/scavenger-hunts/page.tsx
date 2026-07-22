import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { getHunts } from "@/actions/scavenger-hunts";
import { HuntList } from "./hunt-list";

export default async function ScavengerHuntsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const hunts = await getHunts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Scavenger Hunts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The phone version of the paper scavenger hunt you hand out at the
          door. Write the list, print the QR code, and watch a live leaderboard
          as families work through it.
        </p>
      </div>

      <HuntList hunts={hunts} />
    </div>
  );
}
