import { put, del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { mediaLibrary } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  getCurrentSchoolId,
  isSchoolPtaBoardOrAdmin,
} from "@/lib/auth-helpers";
import { ensureTagsExist, decrementTagUsage } from "@/actions/tags";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const altText = formData.get("altText") as string | null;
    const tagsJson = formData.get("tags") as string | null;
    const reusable = formData.get("reusable") !== "false";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Get current school
    const schoolId = await getCurrentSchoolId();
    if (!schoolId) {
      return NextResponse.json(
        { error: "No school selected" },
        { status: 400 }
      );
    }

    // Check PTA board or admin authorization
    const hasAccess = await isSchoolPtaBoardOrAdmin(session.user.id, schoolId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Unauthorized: PTA Board or Admin access required" },
        { status: 403 }
      );
    }

    // Validate file type
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error:
            "Invalid file type. Please upload a JPEG, PNG, GIF, or WebP file.",
        },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    // Upload to Vercel Blob
    const blob = await put(
      `media-library/${schoolId}/${Date.now()}-${file.name}`,
      file,
      {
        access: "public",
        addRandomSuffix: true,
      }
    );

    // Parse tags
    let tags: string[] = [];
    if (tagsJson) {
      try {
        tags = JSON.parse(tagsJson);
      } catch {
        // Ignore parse errors
      }
    }

    // Insert into database
    const [item] = await db
      .insert(mediaLibrary)
      .values({
        schoolId,
        blobUrl: blob.url,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        altText: altText || file.name,
        tags,
        reusable,
        sourceType: "direct",
        uploadedBy: session.user.id,
      })
      .returning();

    // Ensure tags exist in the tags table
    if (tags.length > 0) {
      await ensureTagsExist(tags);
    }

    revalidatePath("/admin/media");

    return NextResponse.json({ item, url: blob.url });
  } catch (error) {
    console.error("Media library upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload media" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const mediaId = searchParams.get("mediaId");

    if (!mediaId) {
      return NextResponse.json(
        { error: "No media ID provided" },
        { status: 400 }
      );
    }

    // Get current school
    const schoolId = await getCurrentSchoolId();
    if (!schoolId) {
      return NextResponse.json(
        { error: "No school selected" },
        { status: 400 }
      );
    }

    // Check PTA board or admin authorization
    const hasAccess = await isSchoolPtaBoardOrAdmin(session.user.id, schoolId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Unauthorized: PTA Board or Admin access required" },
        { status: 403 }
      );
    }

    // Get the media item
    const item = await db.query.mediaLibrary.findFirst({
      where: and(
        eq(mediaLibrary.id, mediaId),
        eq(mediaLibrary.schoolId, schoolId)
      ),
    });

    if (!item) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }

    // Delete from Vercel Blob
    if (item.blobUrl.includes("blob.vercel-storage.com")) {
      try {
        await del(item.blobUrl);
      } catch {
        // Ignore deletion errors from blob storage
      }
    }

    // Decrement tag usage
    if (item.tags && item.tags.length > 0) {
      await decrementTagUsage(item.tags);
    }

    // Delete from database
    await db.delete(mediaLibrary).where(eq(mediaLibrary.id, mediaId));

    revalidatePath("/admin/media");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Media library delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete media" },
      { status: 500 }
    );
  }
}
