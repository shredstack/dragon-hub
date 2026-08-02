import { indexAllSchoolsDriveFiles } from "@/lib/sync/drive-indexer";
import { reprocessStalledDocuments } from "@/lib/documents/index-document";
import { pruneRateLimitHits } from "@/lib/rate-limit";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";

export async function GET(request: Request) {
  // Matches the other cron routes. Board members re-index from the button on
  // /admin/integrations, which goes through a server action and its own
  // permission check — this guard only closes the unauthenticated URL.
  const rejected = rejectUnauthorizedCron(request, "index-drive");
  if (rejected) return rejected;

  try {
    const result = await indexAllSchoolsDriveFiles();

    // Uploaded documents extract their text after the upload response returns,
    // so a cold-start timeout or a transient embedding failure can leave one
    // stuck. Retry those here rather than letting them sit unsearchable.
    const { reprocessed } = await reprocessStalledDocuments();

    // Rate limit windows are write-heavy and read-once. Sweeping them here
    // rather than on the request path keeps the cost off the public signup
    // form, which is the thing the counters exist to protect.
    const prunedRateLimits = await pruneRateLimitHits().catch((error) => {
      console.error("Rate limit prune failed:", error);
      return 0;
    });

    return Response.json({
      success: true,
      ...result,
      reprocessed,
      prunedRateLimits,
    });
  } catch (error) {
    console.error("Drive indexing failed:", error);
    return Response.json(
      { success: false, error: "Indexing failed" },
      { status: 500 }
    );
  }
}
