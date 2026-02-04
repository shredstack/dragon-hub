import { syncBudgetData } from "@/lib/sync/budget";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

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
