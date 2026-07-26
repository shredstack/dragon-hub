import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // The file is sent as a raw request body with its MIME type in the
    // Content-Type header. Avoiding multipart/form-data works around an iOS
    // Safari bug that rejects FormData uploads from the photo picker with
    // "The string did not match the expected pattern." (Same approach as the
    // profile-picture upload route.)
    const contentType = (request.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        {
          error:
            "Invalid file type. Please upload a JPEG, PNG, GIF, or WebP image.",
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await request.arrayBuffer();

    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file size (max 10MB)
    if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    const blob = await put(
      `feedback-screenshots/${session.user.id}-${Date.now()}`,
      arrayBuffer,
      {
        access: "public",
        addRandomSuffix: true,
        contentType,
      }
    );

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("Feedback screenshot upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}
