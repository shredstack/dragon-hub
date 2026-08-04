import { rejectUnauthorizedCron } from "@/lib/cron-auth";
import { runNotificationReminders } from "@/lib/notify-reminders";
import { pruneRateLimitHits } from "@/lib/rate-limit";
import { pruneNativeAuthTickets } from "@/lib/native-auth-tickets";
import { pruneDeletionRequests } from "@/lib/account-deletion-requests";

/**
 * Daily at 16:00 UTC (~9am Pacific).
 *
 * The hour is chosen so "due tomorrow" arrives during a school morning rather
 * than overnight — a reminder that lands at 2am is a reminder nobody reads and
 * a notification permission somebody revokes.
 *
 * Safe to re-run: every reminder carries a `groupKey` containing the task or
 * slot id, so a second invocation collapses onto the row the first one wrote
 * instead of sending a duplicate.
 */
export async function GET(request: Request) {
  const rejected = rejectUnauthorizedCron(request, "notification-reminders");
  if (rejected) return rejected;

  try {
    const result = await runNotificationReminders();

    // Everything else that accumulates and is swept daily rather than on the
    // request path. All three are inert once expired — the sweep is about the
    // table not growing forever, which is the kind of thing that is fine for
    // two years and then isn't.
    const [prunedRateLimits, prunedTickets, prunedDeletions] = await Promise.all(
      [
        pruneRateLimitHits(),
        pruneNativeAuthTickets(),
        pruneDeletionRequests(),
      ]
    );

    console.log(
      `[cron:notification-reminders] tasks=${result.taskReminders} shifts=${result.shiftReminders} ` +
        `deleted(read)=${result.deletedRead} deleted(unread)=${result.deletedUnread} ` +
        `rateLimits=${prunedRateLimits} authTickets=${prunedTickets} deletionRequests=${prunedDeletions}`
    );

    return Response.json({
      success: true,
      ...result,
      prunedRateLimits,
      prunedTickets,
      prunedDeletions,
    });
  } catch (error) {
    console.error("Notification reminders failed:", error);
    return Response.json(
      { success: false, error: "Reminders failed" },
      { status: 500 }
    );
  }
}
