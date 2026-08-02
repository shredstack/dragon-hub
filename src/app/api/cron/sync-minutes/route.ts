import { syncAllSchoolsMinutes } from "@/lib/sync/minutes-sync";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";

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
