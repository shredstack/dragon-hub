import { put, del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload a JPEG, PNG, GIF, or WebP image." },
        { status: 400 }
      );
    }

    // Validate file size (max 4MB)
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 4MB." },
        { status: 400 }
      );
    }

    // Get current user to check for existing image
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { image: true },
    });

    // Delete old image if it exists and is a Vercel Blob URL
    if (currentUser?.image?.includes("blob.vercel-storage.com")) {
      try {
        await del(currentUser.image);
      } catch {
        // Ignore deletion errors
      }
    }

    // Upload to Vercel Blob
    const blob = await put(`profile-pictures/${session.user.id}-${Date.now()}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    // Update user's image in database
    await db
      .update(users)
      .set({ image: blob.url })
      .where(eq(users.id, session.user.id));

    revalidatePath("/profile");
    revalidatePath("/admin/members");

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current user's image
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { image: true },
    });

    // Delete from Vercel Blob if it's a blob URL
    if (currentUser?.image?.includes("blob.vercel-storage.com")) {
      try {
        await del(currentUser.image);
      } catch {
        // Ignore deletion errors
      }
    }

    // Clear image in database
    await db
      .update(users)
      .set({ image: null })
      .where(eq(users.id, session.user.id));

    revalidatePath("/profile");
    revalidatePath("/admin/members");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete image" },
      { status: 500 }
    );
  }
}
