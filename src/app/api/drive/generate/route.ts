import { NextRequest, NextResponse } from "next/server";
import {
  assertAuthenticated,
  getCurrentSchoolId,
  isPtaBoardMember,
} from "@/lib/auth-helpers";
import { getFileContent, isFileInSchoolFolders } from "@/lib/drive";
import { generateArticle } from "@/lib/ai/drive-file-metadata";

export async function POST(request: NextRequest) {
  try {
    const user = await assertAuthenticated();
    const schoolId = await getCurrentSchoolId();
    if (!schoolId) {
      return NextResponse.json(
        { error: "No school selected" },
        { status: 400 }
      );
    }

    // This reads the contents of a Drive file using the school's service
    // account. Drafting a Knowledge Base article from one is a board activity,
    // and the file itself is board material.
    if (!(await isPtaBoardMember(user.id!, schoolId))) {
      return NextResponse.json(
        { error: "Unauthorized: PTA Board access required" },
        { status: 403 }
      );
    }

    const { fileId, fileName, mimeType } = await request.json();

    if (!fileId || !fileName || !mimeType) {
      return NextResponse.json(
        { error: "fileId, fileName, and mimeType are required" },
        { status: 400 }
      );
    }

    // The file id arrives in the request body, so it has to be one of the
    // files this school's configured folders actually offered — otherwise the
    // school's service account becomes a read primitive for anything it can
    // see, which is more than the board ever pointed DragonHub at.
    if (!(await isFileInSchoolFolders(schoolId, fileId))) {
      return NextResponse.json(
        { error: "File is not in a folder connected to this school" },
        { status: 403 }
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
