import { sendCommitteeDigests } from "@/lib/sync/committee-digest";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";

export async function GET(request: Request) {
  const rejected = rejectUnauthorizedCron(request, "committee-digest");
  if (rejected) return rejected;

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
