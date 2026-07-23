import { sendCommitteeDigests } from "@/lib/sync/committee-digest";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await sendCommitteeDigests();
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("Committee digest failed:", error);
    return Response.json(
      { success: false, error: "Digest failed" },
      { status: 500 }
    );
  }
}
