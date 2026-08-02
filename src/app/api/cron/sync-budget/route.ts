import { syncBudgetData } from "@/lib/sync/budget";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";

export async function GET(request: Request) {
  const rejected = rejectUnauthorizedCron(request, "sync-budget");
  if (rejected) return rejected;

  try {
    const result = await syncBudgetData();
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("Budget sync failed:", error);
    return Response.json(
      { success: false, error: "Sync failed" },
      { status: 500 }
    );
  }
}
