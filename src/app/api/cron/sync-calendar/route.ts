import { syncGoogleCalendars } from "@/lib/sync/calendar";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";

export async function GET(request: Request) {
  const rejected = rejectUnauthorizedCron(request, "sync-calendar");
  if (rejected) return rejected;

  try {
    const result = await syncGoogleCalendars();
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("Calendar sync failed:", error);
    return Response.json(
      { success: false, error: "Sync failed" },
      { status: 500 }
    );
  }
}
