import { syncAllSchoolsMinutes } from "@/lib/sync/minutes-sync";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";

// syncAllSchoolsMinutes now also backfills OpenAI embeddings for every
// minutes row across every school that's missing one (see embedPendingMinutes
// in minutes-sync.ts) — on top of the existing Drive listing and AI analysis
// work. That easily outruns the platform default (10s) once there's more
// than a school or two, and a timed-out cron run looks identical to a
// successful empty one in the logs.
export const maxDuration = 300;

export async function GET(request: Request) {
  const rejected = rejectUnauthorizedCron(request, "sync-minutes");
  if (rejected) return rejected;

  try {
    const result = await syncAllSchoolsMinutes();
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("Minutes sync failed:", error);
    return Response.json(
      { success: false, error: "Sync failed" },
      { status: 500 }
    );
  }
}
