import { syncGoogleCalendars } from "@/lib/sync/calendar";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

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
