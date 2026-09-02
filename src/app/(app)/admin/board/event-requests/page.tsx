import Link from "next/link";
import { HandHeart } from "lucide-react";
import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { getEventHelpQueue } from "@/actions/event-directory";
import { EventRequestQueue } from "./event-request-queue";
import { EmptyState } from "@/components/ui/empty-state";
import { WAITLIST_ADMIN_BLURB } from "@/lib/waitlist-shared";

export const metadata = { title: "Help Requests" };

/**
 * Everyone who has asked to join a planning team this year, in one place.
 *
 * Board-gated, and reached from the PTA Board Hub rather than the sidebar —
 * per CLAUDE.md, admin pages are hub cards. A plan's own leads see the same
 * requests on the plan's Team tab, which is where a committee chair who isn't
 * on the board answers them.
 */
export default async function EventRequestsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const groups = await getEventHelpQueue();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Help Requests</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Families who asked to join the team planning an event. This is the one
          of the three signals on{" "}
          <Link href="/events" className="underline underline-offset-2">
            Our Events
          </Link>{" "}
          that needs an answer — reactions and raised hands don&rsquo;t.
        </p>
        <p className="text-muted-foreground mt-2 text-sm">
          Looking for the &ldquo;hands up&rdquo; count? Those are in{" "}
          <Link
            href="/admin/board/raised-hands"
            className="underline underline-offset-2"
          >
            Raised Hands
          </Link>
          .
        </p>
        <p className="text-muted-foreground mt-2 text-sm">
          {WAITLIST_ADMIN_BLURB}
        </p>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={HandHeart}
          title="Nobody is waiting"
          description="When a parent asks to help plan one of your events, they show up here."
        >
          {/* Two ways out, because this empty state is where a board member
              lands when they went looking for the hero's hands-up count — an
              empty queue is not the same as nobody being interested. */}
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/admin/board/raised-hands"
              className="text-dragon-blue-600 dark:text-dragon-blue-400 text-sm font-medium hover:underline"
            >
              See who raised a hand
            </Link>
            <Link
              href="/events"
              className="text-dragon-blue-600 dark:text-dragon-blue-400 text-sm font-medium hover:underline"
            >
              See what families see
            </Link>
          </div>
        </EmptyState>
      ) : (
        <EventRequestQueue groups={groups} />
      )}
    </div>
  );
}
