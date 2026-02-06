import { put, del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calendarEvents, eventFlyers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
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
    const eventId = formData.get("eventId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!eventId) {
      return NextResponse.json(
        { error: "No event ID provided" },
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

    // Verify event belongs to the user's school
    const event = await db.query.calendarEvents.findFirst({
      where: and(
        eq(calendarEvents.id, eventId),
        eq(calendarEvents.schoolId, schoolId)
      ),
    });
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
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
      "application/pdf",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error:
            "Invalid file type. Please upload a JPEG, PNG, GIF, WebP, or PDF file.",
        },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB for flyers)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    // Upload to Vercel Blob
    const blob = await put(
      `calendar-flyers/${eventId}/${Date.now()}-${file.name}`,
      file,
      {
        access: "public",
        addRandomSuffix: true,
      }
    );

    // Get current max sort order
    const existingFlyers = await db.query.eventFlyers.findMany({
      where: eq(eventFlyers.calendarEventId, eventId),
      orderBy: (flyers, { desc }) => [desc(flyers.sortOrder)],
      limit: 1,
    });
    const nextSortOrder = (existingFlyers[0]?.sortOrder ?? -1) + 1;

    // Insert into database
    const [flyer] = await db
      .insert(eventFlyers)
      .values({
        calendarEventId: eventId,
        blobUrl: blob.url,
        fileName: file.name,
        fileSize: file.size,
        sortOrder: nextSortOrder,
        uploadedBy: session.user.id,
      })
      .returning();

    revalidatePath("/calendar");
    revalidatePath(`/calendar/${eventId}`);

    return NextResponse.json({ flyer });
  } catch (error) {
    console.error("Flyer upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload flyer" },
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
    const flyerId = searchParams.get("flyerId");

    if (!flyerId) {
      return NextResponse.json(
        { error: "No flyer ID provided" },
        { status: 400 }
      );
    }

    // Get the flyer with its event
    const flyer = await db.query.eventFlyers.findFirst({
      where: eq(eventFlyers.id, flyerId),
      with: {
        calendarEvent: true,
      },
    });

    if (!flyer) {
      return NextResponse.json({ error: "Flyer not found" }, { status: 404 });
    }

    // Get current school
    const schoolId = await getCurrentSchoolId();
    if (!schoolId) {
      return NextResponse.json(
        { error: "No school selected" },
        { status: 400 }
      );
    }

    // Verify event belongs to user's school
    if (flyer.calendarEvent.schoolId !== schoolId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Check PTA board or admin authorization
    const hasAccess = await isSchoolPtaBoardOrAdmin(session.user.id, schoolId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Unauthorized: PTA Board or Admin access required" },
        { status: 403 }
      );
    }

    // Delete from Vercel Blob
    if (flyer.blobUrl.includes("blob.vercel-storage.com")) {
      try {
        await del(flyer.blobUrl);
      } catch {
        // Ignore deletion errors from blob storage
      }
    }

    // Delete from database
    await db.delete(eventFlyers).where(eq(eventFlyers.id, flyerId));

    revalidatePath("/calendar");
    revalidatePath(`/calendar/${flyer.calendarEventId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Flyer delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete flyer" },
      { status: 500 }
    );
  }
}
