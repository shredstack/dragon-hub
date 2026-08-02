import { syncFundraisers } from "@/lib/sync/fundraisers";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";

export async function GET(request: Request) {
  const rejected = rejectUnauthorizedCron(request, "sync-fundraisers");
  if (rejected) return rejected;

  try {
    const result = await syncFundraisers();
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("Fundraiser sync failed:", error);
    return Response.json(
      { success: false, error: "Sync failed" },
      { status: 500 }
    );
  }
}
