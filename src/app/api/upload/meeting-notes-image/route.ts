import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isEventPlanMember } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { eventPlanMeetingImages, eventPlanMeetings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const meetingId = formData.get("meetingId") as string;
    const eventPlanId = formData.get("eventPlanId") as string;

    if (!file || !meetingId || !eventPlanId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify meeting exists
    const meeting = await db.query.eventPlanMeetings.findFirst({
      where: eq(eventPlanMeetings.id, meetingId),
    });
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Verify user is a member of this event plan
    const isMember = await isEventPlanMember(session.user.id, eventPlanId);
    if (!isMember) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Accept images only — JPEG, PNG, WebP, HEIC (iPhone photos)
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Please upload a photo (JPEG, PNG, WebP, or HEIC)." },
        { status: 400 }
      );
    }

    // Max 10MB — phone photos can be large
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    const blob = await put(
      `meeting-notes-images/${eventPlanId}/${meetingId}/${Date.now()}-${file.name}`,
      file,
      { access: "public", addRandomSuffix: true }
    );

    // Create database record for the uploaded image
    const [image] = await db
      .insert(eventPlanMeetingImages)
      .values({
        meetingId,
        blobUrl: blob.url,
        fileName: file.name,
        uploadedBy: session.user.id,
      })
      .returning();

    return NextResponse.json({
      url: blob.url,
      fileName: file.name,
      imageId: image.id,
    });
  } catch (error) {
    console.error("Meeting notes image upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}
