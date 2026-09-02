import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { mediaLibrary, tags } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getMediaUsage } from "@/lib/media-library";
import { MediaLibraryAdmin } from "./media-library-admin";

export default async function AdminMediaPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const [allMedia, allTags] = await Promise.all([
    db.query.mediaLibrary.findMany({
      where: eq(mediaLibrary.schoolId, schoolId),
      orderBy: [desc(mediaLibrary.createdAt)],
      with: {
        uploader: { columns: { name: true, email: true } },
      },
    }),
    db.query.tags.findMany({
      where: eq(tags.schoolId, schoolId),
      orderBy: [desc(tags.usageCount)],
    }),
  ]);

  // Every image the school has uploaded is catalogued here, so the grid says
  // where each one is still being used — that is the difference between
  // tidying up and blanking a picture in an email that already went out.
  const usage = Object.fromEntries(
    await getMediaUsage(
      schoolId,
      allMedia.map((item) => item.blobUrl)
    )
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Media Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every image uploaded for a weekly email, a submission or the media
          picker lands here automatically. Tag them, mark the reusable ones, and
          delete anything that is no longer relevant.
        </p>
      </div>

      <MediaLibraryAdmin
        initialMedia={allMedia}
        availableTags={allTags}
        usage={usage}
      />
    </div>
  );
}
