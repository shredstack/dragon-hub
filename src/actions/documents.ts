"use server";

import { db } from "@/lib/db";
import {
  driveFileIndex,
  eventPlanMeetings,
  schoolGoogleIntegrations,
} from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertPtaBoardMember,
  assertEventPlanAccess,
  assertEventPlanWriteAccess,
  isPtaBoardMember,
} from "@/lib/auth-helpers";
import { parseDriveFileId, getFileMeta, getFileContent } from "@/lib/drive";
import { getSchoolCurrentYear } from "@/lib/school-year";
import {
  createDocumentRow,
  processDocument,
  documentUrl,
} from "@/lib/documents/index-document";
import { MAX_CONTENT_LENGTH } from "@/lib/documents/extract";

export interface SchoolDocument {
  id: string;
  fileName: string;
  title: string | null;
  description: string | null;
  mimeType: string | null;
  source: "google_drive" | "upload" | "drive_link";
  url: string | undefined;
  fileSize: number | null;
  schoolYear: string | null;
  processingStatus: "pending" | "ready" | "failed";
  processingError: string | null;
  hasContent: boolean;
  integrationName: string | null;
  eventPlanId: string | null;
  meetingId: string | null;
  createdAt: Date | null;
}

/** A document as an attachment list needs it — enough to render a row. */
export interface AttachedDocument {
  id: string;
  fileName: string;
  title: string | null;
  mimeType: string | null;
  fileSize: number | null;
  source: string;
  url: string | undefined;
  processingStatus: string;
}

const ATTACHED_DOCUMENT_COLUMNS = {
  id: true,
  fileName: true,
  title: true,
  mimeType: true,
  fileSize: true,
  source: true,
  blobUrl: true,
  webUrl: true,
  fileId: true,
  processingStatus: true,
  eventPlanId: true,
  meetingId: true,
} as const;

function toAttachedDocument(row: {
  id: string;
  fileName: string;
  title: string | null;
  mimeType: string | null;
  fileSize: number | null;
  source: string;
  blobUrl: string | null;
  webUrl: string | null;
  fileId: string;
  processingStatus: string;
}): AttachedDocument {
  return {
    id: row.id,
    fileName: row.fileName,
    title: row.title,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    source: row.source,
    url: documentUrl(row),
    processingStatus: row.processingStatus,
  };
}

/**
 * Index a Google Drive file that lives outside the school's connected folders.
 *
 * The Resources tab already asks users to share personal Drive files with the
 * service account; this is what makes that sharing worth doing — the file's
 * text gets pulled in and indexed just like a synced one.
 */
export async function addDriveLinkDocument(input: {
  url: string;
  title?: string;
  description?: string;
  eventPlanId?: string;
  meetingId?: string;
}): Promise<AttachedDocument> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // A meeting implies its event plan — resolve it so authorization, the row's
  // attachment point, and revalidation all agree. Mirrors the upload route.
  let eventPlanId = input.eventPlanId ?? null;
  if (!eventPlanId && input.meetingId) {
    const meeting = await db.query.eventPlanMeetings.findFirst({
      where: eq(eventPlanMeetings.id, input.meetingId),
      columns: { eventPlanId: true },
    });
    if (!meeting) throw new Error("Meeting not found");
    eventPlanId = meeting.eventPlanId;
  }

  if (eventPlanId) {
    await assertEventPlanWriteAccess(user.id!, eventPlanId);
  } else {
    await assertPtaBoardMember(user.id!, schoolId);
  }

  const fileId = parseDriveFileId(input.url);
  if (!fileId) {
    throw new Error(
      "That doesn't look like a Google Drive link. Copy the URL from the file's Share dialog."
    );
  }

  const meta = await getFileMeta(schoolId, fileId);
  if (!meta) {
    // Almost always a permissions problem: the file exists but hasn't been
    // shared with the service account. Name the address so the fix is obvious.
    const integration = await db.query.schoolGoogleIntegrations.findFirst({
      where: eq(schoolGoogleIntegrations.schoolId, schoolId),
      columns: { serviceAccountEmail: true, active: true },
    });
    const serviceAccount = integration?.active
      ? integration.serviceAccountEmail
      : null;
    throw new Error(
      serviceAccount
        ? `Can't open that file. Share it with ${serviceAccount} (Viewer access is enough), then try again.`
        : "Can't open that file, and this school has no Google integration configured yet."
    );
  }

  // Best-effort: an unsupported binary type still gets indexed by name.
  let textContent: string | null = null;
  try {
    const content = await getFileContent(schoolId, fileId, meta.mimeType);
    textContent = content.slice(0, MAX_CONTENT_LENGTH);
  } catch {
    // No extractable text — the document is still worth indexing and linking.
  }

  const existing = await db.query.driveFileIndex.findFirst({
    where: and(
      eq(driveFileIndex.schoolId, schoolId),
      eq(driveFileIndex.fileId, fileId)
    ),
    columns: ATTACHED_DOCUMENT_COLUMNS,
  });
  if (existing) {
    const targetMeetingId = input.meetingId ?? null;
    const alreadyAttachedHere =
      existing.meetingId === targetMeetingId &&
      existing.eventPlanId === eventPlanId;

    if ((targetMeetingId || eventPlanId) && !alreadyAttachedHere) {
      // A Drive file is indexed once per school, so its attachment is a single
      // pointer — re-pointing it would quietly pull the file off wherever it
      // lives now. Say so instead of returning a row the caller will render as
      // successfully attached here.
      if (existing.meetingId || existing.eventPlanId) {
        throw new Error(
          "That file is already attached to another meeting or event plan. Detach it there first, or add a separate copy in Drive."
        );
      }
      // Indexed school-wide and now being attached here — without this it
      // would silently never appear on the meeting.
      await db
        .update(driveFileIndex)
        .set({ eventPlanId, meetingId: targetMeetingId })
        .where(eq(driveFileIndex.id, existing.id));
    }

    if (eventPlanId) revalidatePath(`/events/${eventPlanId}`);
    revalidatePath("/knowledge/documents");

    return toAttachedDocument(existing);
  }

  const documentId = await createDocumentRow({
    schoolId,
    fileId,
    fileName: meta.name,
    mimeType: meta.mimeType,
    source: "drive_link",
    webUrl: `https://drive.google.com/file/d/${fileId}`,
    schoolYear: await getSchoolCurrentYear(schoolId),
    title: input.title?.trim() || null,
    description: input.description?.trim() || null,
    uploadedBy: user.id!,
    eventPlanId,
    meetingId: input.meetingId ?? null,
    textContent,
  });

  await processDocument(documentId);

  if (eventPlanId) revalidatePath(`/events/${eventPlanId}`);
  revalidatePath("/knowledge/documents");

  const created = await db.query.driveFileIndex.findFirst({
    where: eq(driveFileIndex.id, documentId),
    columns: ATTACHED_DOCUMENT_COLUMNS,
  });
  if (!created) throw new Error("Document could not be created");
  return toAttachedDocument(created);
}

/**
 * List every document the school has indexed — uploads, shared Drive links,
 * and files synced from connected folders.
 *
 * Scoped to an event plan (or one of its meetings), membership in that plan is
 * enough. Unscoped, this enumerates everything the school has indexed —
 * budget spreadsheets, board handoff notes — so it is board-level only.
 */
export async function listSchoolDocuments(options?: {
  source?: "google_drive" | "upload" | "drive_link";
  eventPlanId?: string;
  meetingId?: string;
  search?: string;
  limit?: number;
}): Promise<SchoolDocument[]> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  if (options?.eventPlanId) {
    await assertEventPlanAccess(user.id!, options.eventPlanId);
  } else if (options?.meetingId) {
    // A meeting only makes sense inside its plan — authorize against that.
    const meeting = await db.query.eventPlanMeetings.findFirst({
      where: eq(eventPlanMeetings.id, options.meetingId),
      columns: { eventPlanId: true },
    });
    if (!meeting) throw new Error("Meeting not found");
    await assertEventPlanAccess(user.id!, meeting.eventPlanId);
  } else {
    await assertPtaBoardMember(user.id!, schoolId);
  }

  const conditions = [eq(driveFileIndex.schoolId, schoolId)];
  if (options?.source) conditions.push(eq(driveFileIndex.source, options.source));
  if (options?.eventPlanId) {
    conditions.push(eq(driveFileIndex.eventPlanId, options.eventPlanId));
  }
  if (options?.meetingId) {
    conditions.push(eq(driveFileIndex.meetingId, options.meetingId));
  }

  const search = options?.search?.trim();
  if (search) {
    // Content matching goes through search_vector so it uses the GIN index
    // rather than scanning text_content, which runs to 10KB a row. Names and
    // titles keep an ILIKE so partial words ("budg") still match and rows
    // whose vector hasn't been built yet remain findable.
    const pattern = `%${search.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    conditions.push(
      sql`(${driveFileIndex.searchVector} @@ plainto_tsquery('english', ${search}) OR ${driveFileIndex.fileName} ILIKE ${pattern} OR ${driveFileIndex.title} ILIKE ${pattern})`
    );
  }

  const rows = await db
    .select({
      id: driveFileIndex.id,
      fileName: driveFileIndex.fileName,
      fileId: driveFileIndex.fileId,
      title: driveFileIndex.title,
      description: driveFileIndex.description,
      mimeType: driveFileIndex.mimeType,
      source: driveFileIndex.source,
      blobUrl: driveFileIndex.blobUrl,
      webUrl: driveFileIndex.webUrl,
      fileSize: driveFileIndex.fileSize,
      schoolYear: driveFileIndex.schoolYear,
      processingStatus: driveFileIndex.processingStatus,
      processingError: driveFileIndex.processingError,
      // The full text can be 10KB per row — only report whether it exists.
      hasContent: sql<boolean>`${driveFileIndex.textContent} IS NOT NULL`,
      integrationName: driveFileIndex.integrationName,
      eventPlanId: driveFileIndex.eventPlanId,
      meetingId: driveFileIndex.meetingId,
      createdAt: driveFileIndex.createdAt,
    })
    .from(driveFileIndex)
    .where(and(...conditions))
    .orderBy(desc(driveFileIndex.createdAt))
    .limit(options?.limit ?? 200);

  return rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    title: row.title,
    description: row.description,
    mimeType: row.mimeType,
    source: row.source,
    url: documentUrl(row),
    fileSize: row.fileSize,
    schoolYear: row.schoolYear,
    processingStatus: row.processingStatus,
    processingError: row.processingError,
    hasContent: row.hasContent,
    integrationName: row.integrationName,
    eventPlanId: row.eventPlanId,
    meetingId: row.meetingId,
    createdAt: row.createdAt,
  }));
}

export async function deleteDocument(documentId: string): Promise<void> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const doc = await db.query.driveFileIndex.findFirst({
    where: and(
      eq(driveFileIndex.id, documentId),
      eq(driveFileIndex.schoolId, schoolId)
    ),
  });
  if (!doc) throw new Error("Document not found");

  // Drive-synced rows belong to the sync job — deleting one here would only
  // have it reappear on the next run.
  if (doc.source === "google_drive") {
    throw new Error(
      "This file is synced from Google Drive. Remove it in Drive or disconnect the folder."
    );
  }

  if (doc.eventPlanId) {
    await assertEventPlanWriteAccess(user.id!, doc.eventPlanId);
  } else {
    await assertPtaBoardMember(user.id!, schoolId);
  }

  if (doc.blobUrl?.includes("blob.vercel-storage.com")) {
    try {
      await del(doc.blobUrl);
    } catch {
      // Blob already gone — still remove the index row.
    }
  }

  await db.delete(driveFileIndex).where(eq(driveFileIndex.id, documentId));

  if (doc.eventPlanId) revalidatePath(`/events/${doc.eventPlanId}`);
  revalidatePath("/knowledge/documents");
}

/** Retry extraction and embedding for a document that failed or stalled. */
export async function reprocessDocument(documentId: string): Promise<void> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const doc = await db.query.driveFileIndex.findFirst({
    where: and(
      eq(driveFileIndex.id, documentId),
      eq(driveFileIndex.schoolId, schoolId)
    ),
    columns: { id: true, eventPlanId: true },
  });
  if (!doc) throw new Error("Document not found");

  if (doc.eventPlanId) {
    await assertEventPlanWriteAccess(user.id!, doc.eventPlanId);
  } else {
    await assertPtaBoardMember(user.id!, schoolId);
  }

  await processDocument(documentId);

  if (doc.eventPlanId) revalidatePath(`/events/${doc.eventPlanId}`);
  revalidatePath("/knowledge/documents");
}

/** Whether the current user may upload documents outside an event plan. */
export async function canManageSchoolDocuments(): Promise<boolean> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return false;
  return isPtaBoardMember(user.id!, schoolId);
}
