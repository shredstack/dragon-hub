import { indexAllSchoolsDriveFiles } from "@/lib/sync/drive-indexer";

export async function GET() {
  // TODO: Uncomment auth check after testing
  // const authHeader = request.headers.get("authorization");
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return new Response("Unauthorized", { status: 401 });
  // }

  try {
    const result = await indexAllSchoolsDriveFiles();
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("Drive indexing failed:", error);
    return Response.json(
      { success: false, error: "Indexing failed" },
      { status: 500 }
    );
  }
}
