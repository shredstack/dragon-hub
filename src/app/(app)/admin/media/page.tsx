import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { mediaLibrary, tags } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Media Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage and organize reusable images for emails and content. Images
          marked as reusable will appear in the media picker throughout the app.
        </p>
      </div>

      <MediaLibraryAdmin
        initialMedia={allMedia}
        availableTags={allTags}
      />
    </div>
  );
}
