import { indexAllSchoolsDriveFiles } from "@/lib/sync/drive-indexer";
import { reprocessStalledDocuments } from "@/lib/documents/index-document";

export async function GET() {
  // TODO: Uncomment auth check after testing
  // const authHeader = request.headers.get("authorization");
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return new Response("Unauthorized", { status: 401 });
  // }

  try {
    const result = await indexAllSchoolsDriveFiles();

    // Uploaded documents extract their text after the upload response returns,
    // so a cold-start timeout or a transient embedding failure can leave one
    // stuck. Retry those here rather than letting them sit unsearchable.
    const { reprocessed } = await reprocessStalledDocuments();

    return Response.json({ success: true, ...result, reprocessed });
  } catch (error) {
    console.error("Drive indexing failed:", error);
    return Response.json(
      { success: false, error: "Indexing failed" },
      { status: 500 }
    );
  }
}
