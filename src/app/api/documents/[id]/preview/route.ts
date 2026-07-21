import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { driveFileIndex, eventPlanMeetings } from "@/lib/db/schema";
import {
  getCurrentSchoolId,
  isSchoolPtaBoardOrAdmin,
  assertEventPlanAccess,
} from "@/lib/auth-helpers";
import { isWordDocument } from "@/lib/documents/preview";
import { sanitizeDocumentHtml } from "@/lib/documents/sanitize";

// Converted HTML carries base64 images inline, so a photo-heavy document can
// run to megabytes. Past this the reader view stops being a convenience.
const MAX_HTML_LENGTH = 400_000;

export interface DocumentPreview {
  kind: "html" | "text" | "pending" | "none";
  content?: string;
  truncated?: boolean;
}

/**
 * Readable content for a document, so it can be opened inside the app instead
 * of downloaded first — which on a phone means leaving the app entirely.
 *
 * Word files are converted to formatted HTML; everything else falls back to
 * the text already extracted for search, which covers Drive files and
 * spreadsheets that have no blob to render.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schoolId = await getCurrentSchoolId();
    if (!schoolId) {
      return NextResponse.json({ error: "No school selected" }, { status: 400 });
    }

    const { id } = await params;
    const doc = await db.query.driveFileIndex.findFirst({
      where: and(
        eq(driveFileIndex.id, id),
        eq(driveFileIndex.schoolId, schoolId)
      ),
      columns: {
        id: true,
        fileName: true,
        mimeType: true,
        blobUrl: true,
        textContent: true,
        processingStatus: true,
        eventPlanId: true,
        meetingId: true,
      },
    });
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Mirrors the upload path: a meeting attachment is authorized against the
    // plan that owns the meeting, and anything unattached is board-level.
    let eventPlanId = doc.eventPlanId;
    if (!eventPlanId && doc.meetingId) {
      const meeting = await db.query.eventPlanMeetings.findFirst({
        where: eq(eventPlanMeetings.id, doc.meetingId),
        columns: { eventPlanId: true },
      });
      eventPlanId = meeting?.eventPlanId ?? null;
    }

    if (eventPlanId) {
      try {
        await assertEventPlanAccess(session.user.id, eventPlanId);
      } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    } else if (!(await isSchoolPtaBoardOrAdmin(session.user.id, schoolId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (doc.blobUrl && isWordDocument(doc.mimeType, doc.fileName)) {
      const response = await fetch(doc.blobUrl);
      if (!response.ok) {
        return NextResponse.json(
          { error: "Could not load the file." },
          { status: 502 }
        );
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const mammoth = await import("mammoth");
      const { value } = await mammoth.convertToHtml({ buffer });
      const html = sanitizeDocumentHtml(value);
      return NextResponse.json({
        kind: "html",
        content: html.slice(0, MAX_HTML_LENGTH),
        truncated: html.length > MAX_HTML_LENGTH,
      } satisfies DocumentPreview);
    }

    if (doc.textContent) {
      return NextResponse.json({
        kind: "text",
        content: doc.textContent,
      } satisfies DocumentPreview);
    }

    // Extraction is queued right after upload but can take a while on a large
    // scanned PDF — say so rather than showing an empty reader.
    return NextResponse.json({
      kind: doc.processingStatus === "pending" ? "pending" : "none",
    } satisfies DocumentPreview);
  } catch (error) {
    console.error("Document preview error:", error);
    return NextResponse.json(
      { error: "Failed to load preview" },
      { status: 500 }
    );
  }
}
