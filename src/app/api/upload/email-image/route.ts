import { put, del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailContentImages, emailContentItems, emailSections } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  getCurrentSchoolId,
  isPtaBoardMember,
} from "@/lib/auth-helpers";
import {
  deleteBlobUnlessInLibrary,
  recordMediaLibraryUpload,
} from "@/lib/media-library";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const contentItemId = formData.get("contentItemId") as string | null;
    const sectionId = formData.get("sectionId") as string | null;

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
    const hasAccess = await isPtaBoardMember(session.user.id, schoolId);
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
      `email-images/${schoolId}/${Date.now()}-${file.name}`,
      file,
      {
        access: "public",
        addRandomSuffix: true,
      }
    );

    // Every email image joins the media library, so the banner someone
    // uploaded for last October's fall festival is findable next October
    // instead of living only inside a sent email. Recorded after the entity
    // below checks out — an upload we are about to throw away for pointing at
    // another school's section must not be catalogued first.
    const catalog = () =>
      recordMediaLibraryUpload({
        schoolId,
        blobUrl: blob.url,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        sourceType: "email",
        sourceId: sectionId || contentItemId || null,
        uploadedBy: session.user!.id,
      });

    // If this is for a content item, save to database
    if (contentItemId) {
      // Verify content item belongs to this school
      const item = await db.query.emailContentItems.findFirst({
        where: eq(emailContentItems.id, contentItemId),
      });
      if (!item || item.schoolId !== schoolId) {
        // Delete the uploaded blob since we can't use it
        try {
          await del(blob.url);
        } catch {
          // Ignore deletion errors
        }
        return NextResponse.json(
          { error: "Content item not found" },
          { status: 404 }
        );
      }

      // Get next sort order
      const existingImages = await db.query.emailContentImages.findMany({
        where: eq(emailContentImages.contentItemId, contentItemId),
      });
      const sortOrder = existingImages.length;

      // Insert image record
      const [image] = await db
        .insert(emailContentImages)
        .values({
          contentItemId,
          blobUrl: blob.url,
          fileName: file.name,
          fileSize: file.size,
          sortOrder,
          uploadedBy: session.user.id,
        })
        .returning();

      await catalog();

      revalidatePath("/emails/submit");
      revalidatePath("/admin/media");

      return NextResponse.json({ image, url: blob.url });
    }

    // If this is for a section, update the section's image URL
    if (sectionId) {
      const section = await db.query.emailSections.findFirst({
        where: eq(emailSections.id, sectionId),
        with: { campaign: true },
      });
      if (!section || section.campaign.schoolId !== schoolId) {
        // Delete the uploaded blob since we can't use it
        try {
          await del(blob.url);
        } catch {
          // Ignore deletion errors
        }
        return NextResponse.json(
          { error: "Section not found" },
          { status: 404 }
        );
      }

      // Let go of the picture this one replaces — but only if it isn't in the
      // media library. It usually is now, and a catalogued file outlives the
      // placement it was first uploaded for; the library's delete button is
      // where a school throws an image away.
      await deleteBlobUnlessInLibrary(schoolId, section.imageUrl);

      // Update section with new image
      await db
        .update(emailSections)
        .set({
          imageUrl: blob.url,
          imageAlt: file.name,
          updatedAt: new Date(),
        })
        .where(eq(emailSections.id, sectionId));

      await catalog();

      revalidatePath(`/emails/${section.campaignId}`);
      revalidatePath("/admin/media");

      return NextResponse.json({ url: blob.url });
    }

    // No entity: the header editor and the content-submission form both upload
    // first and attach on save. The library is what keeps such an image from
    // becoming an untracked blob when the form is abandoned.
    await catalog();
    revalidatePath("/admin/media");

    return NextResponse.json({ url: blob.url, fileName: file.name });
  } catch (error) {
    console.error("Email image upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
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
    const imageId = searchParams.get("imageId");
    const imageUrl = searchParams.get("imageUrl");

    // Get current school
    const schoolId = await getCurrentSchoolId();
    if (!schoolId) {
      return NextResponse.json(
        { error: "No school selected" },
        { status: 400 }
      );
    }

    // Check PTA board or admin authorization
    const hasAccess = await isPtaBoardMember(session.user.id, schoolId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Unauthorized: PTA Board or Admin access required" },
        { status: 403 }
      );
    }

    // If deleting by image ID (content item image)
    if (imageId) {
      const image = await db.query.emailContentImages.findFirst({
        where: eq(emailContentImages.id, imageId),
        with: { contentItem: true },
      });

      if (!image) {
        return NextResponse.json({ error: "Image not found" }, { status: 404 });
      }

      if (image.contentItem.schoolId !== schoolId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      // The file goes only if the library isn't cataloguing it — see
      // deleteBlobUnlessInLibrary.
      await deleteBlobUnlessInLibrary(schoolId, image.blobUrl);

      // Delete from database
      await db
        .delete(emailContentImages)
        .where(eq(emailContentImages.id, imageId));

      revalidatePath("/emails/submit");

      return NextResponse.json({ success: true });
    }

    // If deleting by URL directly (for section images)
    if (imageUrl && imageUrl.includes("blob.vercel-storage.com")) {
      await deleteBlobUnlessInLibrary(schoolId, imageUrl);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "No image ID or URL provided" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Email image delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete image" },
      { status: 500 }
    );
  }
}
