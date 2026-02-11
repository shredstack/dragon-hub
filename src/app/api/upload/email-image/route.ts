import { put, del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailContentImages, emailContentItems, emailSections } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  getCurrentSchoolId,
  isSchoolPtaBoardOrAdmin,
} from "@/lib/auth-helpers";

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
      `email-images/${schoolId}/${Date.now()}-${file.name}`,
      file,
      {
        access: "public",
        addRandomSuffix: true,
      }
    );

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

      revalidatePath("/emails/submit");

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

      // Delete old image if exists
      if (section.imageUrl?.includes("blob.vercel-storage.com")) {
        try {
          await del(section.imageUrl);
        } catch {
          // Ignore deletion errors
        }
      }

      // Update section with new image
      await db
        .update(emailSections)
        .set({
          imageUrl: blob.url,
          imageAlt: file.name,
          updatedAt: new Date(),
        })
        .where(eq(emailSections.id, sectionId));

      revalidatePath(`/emails/${section.campaignId}`);

      return NextResponse.json({ url: blob.url });
    }

    // Return just the URL if no entity specified
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
    const hasAccess = await isSchoolPtaBoardOrAdmin(session.user.id, schoolId);
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

      // Delete from Vercel Blob
      if (image.blobUrl.includes("blob.vercel-storage.com")) {
        try {
          await del(image.blobUrl);
        } catch {
          // Ignore deletion errors from blob storage
        }
      }

      // Delete from database
      await db
        .delete(emailContentImages)
        .where(eq(emailContentImages.id, imageId));

      revalidatePath("/emails/submit");

      return NextResponse.json({ success: true });
    }

    // If deleting by URL directly (for section images)
    if (imageUrl && imageUrl.includes("blob.vercel-storage.com")) {
      try {
        await del(imageUrl);
      } catch {
        // Ignore deletion errors from blob storage
      }
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
