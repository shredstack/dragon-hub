import Link from "next/link";
import { Hand } from "lucide-react";
import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { getRaisedHands } from "@/actions/event-directory";
import { EmptyState } from "@/components/ui/empty-state";
import { RaisedHandsRoster } from "./raised-hands-roster";

export const metadata = { title: "Raised Hands" };

/**
 * Everyone who said "I'd help" on Our Events this year, in one place.
 *
 * The page the hero's "12 events · 3 cheers · 4 hands up" links to. Without it
 * that last number was a dead end: the names lived one event at a time behind
 * an expanded row in Recurring Events, and a board member looking for them
 * reasonably tried Help Requests, which is a different table and said nobody
 * was waiting.
 *
 * Nothing here writes. A raised hand grants nothing and needs no answer — the
 * next step is a board member emailing them, which is why the only control on
 * the page copies addresses.
 */
export default async function RaisedHandsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const groups = await getRaisedHands();
  const handsUp = groups
    .filter((g) => g.inDirectory)
    .reduce((sum, g) => sum + g.handsUp, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Raised Hands</h1>
        <p className="text-muted-foreground mt-1 max-w-prose text-sm">
          Families who tapped &ldquo;I&rsquo;d help&rdquo; or &ldquo;I&rsquo;d
          like to lead&rdquo; on{" "}
          <Link href="/events" className="underline underline-offset-2">
            Our Events
          </Link>
          . A raised hand is a private signal to the board, not a request:
          nobody is waiting on an answer, and it grants no access to anything.
          Inviting them onto a team is up to you.
        </p>
        <p className="text-muted-foreground mt-2 max-w-prose text-sm">
          Asking to <em>join a planning team</em> is the signal that does need
          an answer, and it lives in{" "}
          <Link
            href="/admin/board/event-requests"
            className="underline underline-offset-2"
          >
            Help Requests
          </Link>
          .
        </p>
        {handsUp > 0 && (
          <p className="mt-3 text-sm font-medium">
            {handsUp} {handsUp === 1 ? "hand" : "hands"} up this year — the
            number in the hero on Our Events.
          </p>
        )}
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={Hand}
          title="No hands up yet"
          description="When someone raises a hand for one of your events, they show up here."
        >
          <Link
            href="/events"
            className="text-dragon-blue-600 dark:text-dragon-blue-400 text-sm font-medium hover:underline"
          >
            See what families see
          </Link>
        </EmptyState>
      ) : (
        <RaisedHandsRoster groups={groups} />
      )}
    </div>
  );
}
