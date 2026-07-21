"use server";

import { db } from "@/lib/db";
import { driveFileIndex, schoolGoogleIntegrations } from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertSchoolPtaBoardOrAdmin,
  assertEventPlanAccess,
  isSchoolPtaBoardOrAdmin,
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
}): Promise<{ id: string; fileName: string }> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  if (input.eventPlanId) {
    await assertEventPlanAccess(user.id!, input.eventPlanId);
  } else {
    await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);
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
    columns: { id: true, fileName: true },
  });
  if (existing) {
    return { id: existing.id, fileName: existing.fileName };
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
    eventPlanId: input.eventPlanId ?? null,
    meetingId: input.meetingId ?? null,
    textContent,
  });

  await processDocument(documentId);

  if (input.eventPlanId) revalidatePath(`/events/${input.eventPlanId}`);
  revalidatePath("/knowledge/documents");

  return { id: documentId, fileName: meta.name };
}

/**
 * List every document the school has indexed — uploads, shared Drive links,
 * and files synced from connected folders.
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
    const pattern = `%${search.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    conditions.push(
      sql`(${driveFileIndex.fileName} ILIKE ${pattern} OR ${driveFileIndex.title} ILIKE ${pattern} OR ${driveFileIndex.textContent} ILIKE ${pattern})`
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
    await assertEventPlanAccess(user.id!, doc.eventPlanId);
  } else {
    await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);
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
    await assertEventPlanAccess(user.id!, doc.eventPlanId);
  } else {
    await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);
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
  return isSchoolPtaBoardOrAdmin(user.id!, schoolId);
}
