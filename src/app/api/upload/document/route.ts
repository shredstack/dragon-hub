import { put, del } from "@vercel/blob";
import { NextResponse, after } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  driveFileIndex,
  eventPlanMeetings,
  knowledgeArticles,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  getCurrentSchoolId,
  isSchoolPtaBoardOrAdmin,
  assertEventPlanWriteAccess,
} from "@/lib/auth-helpers";
import {
  createDocumentRow,
  processDocument,
} from "@/lib/documents/index-document";
import { isSupportedUpload } from "@/lib/documents/extract";
import { getSchoolCurrentYear } from "@/lib/school-year";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

/**
 * Upload a document into the school's document index.
 *
 * The file goes to Vercel Blob and lands in drive_file_index alongside
 * Drive-synced files, so it feeds the same full-text and semantic search the
 * AI already uses when helping plan events.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schoolId = await getCurrentSchoolId();
    if (!schoolId) {
      return NextResponse.json({ error: "No school selected" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string | null)?.trim() || null;
    const description =
      (formData.get("description") as string | null)?.trim() || null;
    const eventPlanId = (formData.get("eventPlanId") as string | null) || null;
    const meetingId = (formData.get("meetingId") as string | null) || null;
    const knowledgeArticleId =
      (formData.get("knowledgeArticleId") as string | null) || null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // A meeting implies its event plan — resolve it so authorization and the
    // attachment point agree.
    let resolvedEventPlanId = eventPlanId;
    if (meetingId) {
      const meeting = await db.query.eventPlanMeetings.findFirst({
        where: eq(eventPlanMeetings.id, meetingId),
        columns: { eventPlanId: true },
      });
      if (!meeting) {
        return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
      }
      resolvedEventPlanId = meeting.eventPlanId;
    }

    // A Knowledge Base article decides who can read whatever hangs off it, so
    // the article has to belong to this school. Without this a board member at
    // one school could attach a file to another school's article and have it
    // served to that school's parents.
    if (knowledgeArticleId) {
      const article = await db.query.knowledgeArticles.findFirst({
        where: and(
          eq(knowledgeArticles.id, knowledgeArticleId),
          eq(knowledgeArticles.schoolId, schoolId)
        ),
        columns: { id: true },
      });
      if (!article) {
        return NextResponse.json(
          { error: "Article not found" },
          { status: 404 }
        );
      }
    }

    // Event plan members can attach documents to their own plan; everything
    // else (standalone / Knowledge Base) is a board-level action.
    if (resolvedEventPlanId) {
      try {
        await assertEventPlanWriteAccess(session.user.id, resolvedEventPlanId);
      } catch (err) {
        return NextResponse.json(
          {
            error:
              err instanceof Error
                ? err.message
                : "Unauthorized: Not a member of this event plan",
          },
          { status: 403 }
        );
      }
    } else {
      const hasAccess = await isSchoolPtaBoardOrAdmin(session.user.id, schoolId);
      if (!hasAccess) {
        return NextResponse.json(
          { error: "Unauthorized: PTA Board or Admin access required" },
          { status: 403 }
        );
      }
    }

    if (!isSupportedUpload(file.type, file.name)) {
      return NextResponse.json(
        {
          error:
            "Unsupported file type. Upload a PDF, Word, Excel, PowerPoint, text, or image file.",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 25MB." },
        { status: 400 }
      );
    }

    const blob = await put(
      `documents/${schoolId}/${Date.now()}-${file.name}`,
      file,
      { access: "public", addRandomSuffix: true }
    );

    const documentId = await createDocumentRow({
      schoolId,
      // Synthetic id — the unique constraint on (school_id, file_id) is shared
      // with real Drive file ids, so uploads carry a prefix that cannot collide.
      fileId: `upload:${randomUUID()}`,
      fileName: file.name,
      mimeType: file.type || null,
      source: "upload",
      blobUrl: blob.url,
      fileSize: file.size,
      schoolYear: await getSchoolCurrentYear(schoolId),
      title,
      description,
      uploadedBy: session.user.id,
      eventPlanId: resolvedEventPlanId,
      meetingId,
      knowledgeArticleId,
    });

    // Extraction and embedding can take tens of seconds on a large scanned
    // PDF. Run them after the response so the upload feels instant; the
    // drive-sync cron retries anything left pending.
    after(async () => {
      await processDocument(documentId);
      if (resolvedEventPlanId) revalidatePath(`/events/${resolvedEventPlanId}`);
      revalidatePath("/knowledge/documents");
    });

    if (resolvedEventPlanId) revalidatePath(`/events/${resolvedEventPlanId}`);
    revalidatePath("/knowledge/documents");

    // The full row, so the caller can show the attachment immediately instead
    // of waiting for the page data to come back around.
    return NextResponse.json({
      document: {
        id: documentId,
        fileName: file.name,
        title,
        mimeType: file.type || null,
        fileSize: file.size,
        source: "upload",
        url: blob.url,
        blobUrl: blob.url,
        processingStatus: "pending",
      },
    });
  } catch (error) {
    console.error("Document upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload document" },
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

    const schoolId = await getCurrentSchoolId();
    if (!schoolId) {
      return NextResponse.json({ error: "No school selected" }, { status: 400 });
    }

    const documentId = new URL(request.url).searchParams.get("documentId");
    if (!documentId) {
      return NextResponse.json(
        { error: "No document ID provided" },
        { status: 400 }
      );
    }

    const doc = await db.query.driveFileIndex.findFirst({
      where: and(
        eq(driveFileIndex.id, documentId),
        eq(driveFileIndex.schoolId, schoolId)
      ),
    });
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Drive-synced rows are owned by the sync job — deleting one here would
    // just have it reappear on the next run.
    if (doc.source === "google_drive") {
      return NextResponse.json(
        {
          error:
            "This file is synced from Google Drive. Remove it in Drive or disconnect the folder.",
        },
        { status: 400 }
      );
    }

    if (doc.eventPlanId) {
      try {
        await assertEventPlanWriteAccess(session.user.id, doc.eventPlanId);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Unauthorized" },
          { status: 403 }
        );
      }
    } else {
      const hasAccess = await isSchoolPtaBoardOrAdmin(session.user.id, schoolId);
      if (!hasAccess) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    if (doc.blobUrl?.includes("blob.vercel-storage.com")) {
      try {
        await del(doc.blobUrl);
      } catch {
        // Blob already gone — proceed with removing the index row.
      }
    }

    await db.delete(driveFileIndex).where(eq(driveFileIndex.id, documentId));

    if (doc.eventPlanId) revalidatePath(`/events/${doc.eventPlanId}`);
    revalidatePath("/knowledge/documents");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Document delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
