import { NextRequest, NextResponse } from "next/server";
import { assertAuthenticated, getCurrentSchoolId } from "@/lib/auth-helpers";
import { getFileContent } from "@/lib/drive";
import { generateArticle } from "@/lib/generate-article";

export async function POST(request: NextRequest) {
  try {
    await assertAuthenticated();
    const schoolId = await getCurrentSchoolId();
    if (!schoolId) {
      return NextResponse.json(
        { error: "No school selected" },
        { status: 400 }
      );
    }

    const { fileId, fileName, mimeType } = await request.json();

    if (!fileId || !fileName || !mimeType) {
      return NextResponse.json(
        { error: "fileId, fileName, and mimeType are required" },
        { status: 400 }
      );
    }

    const content = await getFileContent(schoolId, fileId, mimeType);

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: "File appears to be empty or unreadable" },
        { status: 422 }
      );
    }

    const article = await generateArticle(content, fileName);

    return NextResponse.json({ article });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate article";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
