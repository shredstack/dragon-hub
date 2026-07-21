import { db } from "@/lib/db";
import { driveFileIndex } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { formatDriveFileForEmbedding } from "@/lib/ai/embedding-formatters";
import { extractText } from "./extract";

/**
 * Build the canonical link for a document index row.
 *
 * The index holds three kinds of rows and each has a different home: uploads
 * live in Vercel Blob, one-off links point at the original Drive file, and
 * synced files are addressed by their Drive file id.
 */
export function documentUrl(row: {
  source?: string | null;
  blob_url?: string | null;
  blobUrl?: string | null;
  web_url?: string | null;
  webUrl?: string | null;
  file_id?: string | null;
  fileId?: string | null;
}): string | undefined {
  const blobUrl = row.blob_url ?? row.blobUrl;
  const webUrl = row.web_url ?? row.webUrl;
  const fileId = row.file_id ?? row.fileId;

  if (blobUrl) return blobUrl;
  if (webUrl) return webUrl;
  // Uploads use a synthetic "upload:<uuid>" file id that is not a Drive id.
  if (fileId && !fileId.startsWith("upload:")) {
    return `https://drive.google.com/file/d/${fileId}`;
  }
  return undefined;
}

export interface IndexDocumentInput {
  schoolId: string;
  fileId: string;
  fileName: string;
  mimeType: string | null;
  source: "upload" | "drive_link";
  blobUrl?: string | null;
  webUrl?: string | null;
  fileSize?: number | null;
  schoolYear?: string | null;
  title?: string | null;
  description?: string | null;
  uploadedBy?: string | null;
  eventPlanId?: string | null;
  meetingId?: string | null;
  knowledgeArticleId?: string | null;
  /** Pre-extracted text (Drive links already have content fetched via the API). */
  textContent?: string | null;
}

/**
 * Create the index row for a document without its text content yet.
 *
 * Split from processing so an upload request can return as soon as the file is
 * safely in Blob storage — extraction and embedding can take tens of seconds
 * for a large scanned PDF, which is far too long to hold the UI.
 */
export async function createDocumentRow(
  input: IndexDocumentInput
): Promise<string> {
  const displayName = input.title || input.fileName;

  const [row] = await db
    .insert(driveFileIndex)
    .values({
      schoolId: input.schoolId,
      fileId: input.fileId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      source: input.source,
      blobUrl: input.blobUrl ?? null,
      webUrl: input.webUrl ?? null,
      fileSize: input.fileSize ?? null,
      schoolYear: input.schoolYear ?? null,
      title: input.title ?? null,
      description: input.description ?? null,
      uploadedBy: input.uploadedBy ?? null,
      eventPlanId: input.eventPlanId ?? null,
      meetingId: input.meetingId ?? null,
      knowledgeArticleId: input.knowledgeArticleId ?? null,
      textContent: input.textContent ?? null,
      processingStatus: "pending",
    })
    .returning({ id: driveFileIndex.id });

  // Seed the search vector from the title so the document is findable by name
  // immediately, before extraction finishes.
  await db.execute(sql`
    UPDATE drive_file_index
    SET search_vector =
      setweight(to_tsvector('english', ${displayName}), 'A') ||
      setweight(to_tsvector('english', coalesce(${input.description ?? ""}, '')), 'B')
    WHERE id = ${row.id}
  `);

  return row.id;
}

/**
 * Extract text, rebuild the search vector, and generate the embedding.
 *
 * Mirrors the weighting used by the Drive sync in
 * src/lib/sync/drive-indexer.ts (name A, source label B, content C) so
 * uploaded documents rank consistently against synced ones.
 */
export async function processDocument(documentId: string): Promise<void> {
  const doc = await db.query.driveFileIndex.findFirst({
    where: eq(driveFileIndex.id, documentId),
  });
  if (!doc) return;

  try {
    let textContent = doc.textContent;

    // Drive links arrive with content already fetched through the Drive API.
    if (!textContent && doc.blobUrl) {
      const response = await fetch(doc.blobUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch blob (${response.status})`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      textContent = await extractText(buffer, doc.mimeType, doc.fileName);
    }

    const displayName = doc.title || doc.fileName;
    const sourceLabel = doc.description || sourceLabelFor(doc.source);

    await db.execute(sql`
      UPDATE drive_file_index
      SET
        text_content = ${textContent},
        search_vector =
          setweight(to_tsvector('english', ${displayName}), 'A') ||
          setweight(to_tsvector('english', coalesce(${sourceLabel}, '')), 'B') ||
          setweight(to_tsvector('english', coalesce(${textContent}, '')), 'C'),
        processing_status = 'ready',
        processing_error = NULL,
        last_indexed_at = NOW()
      WHERE id = ${documentId}
    `);

    const embedding = await generateEmbedding(
      formatDriveFileForEmbedding({
        fileName: displayName,
        textContent,
        integrationName: doc.integrationName ?? sourceLabel,
      })
    );
    await db
      .update(driveFileIndex)
      .set({ embedding })
      .where(eq(driveFileIndex.id, documentId));
  } catch (error) {
    console.error(`Failed to process document ${documentId}:`, error);
    await db
      .update(driveFileIndex)
      .set({
        processingStatus: "failed",
        processingError:
          error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(driveFileIndex.id, documentId));
  }
}

function sourceLabelFor(source: string): string {
  if (source === "upload") return "Uploaded document";
  if (source === "drive_link") return "Shared Google Drive file";
  return "Google Drive";
}

/**
 * Retry documents whose extraction never completed — a cold-start timeout
 * during the post-response work, or a transient embedding API failure.
 * Called from the Drive sync cron.
 */
export async function reprocessStalledDocuments(
  limit = 10
): Promise<{ reprocessed: number }> {
  const stalled = await db.execute<{ id: string }>(sql`
    SELECT id FROM drive_file_index
    WHERE processing_status IN ('pending', 'failed')
      AND source IN ('upload', 'drive_link')
      AND created_at < NOW() - INTERVAL '5 minutes'
    ORDER BY created_at ASC
    LIMIT ${limit}
  `);

  for (const row of stalled.rows) {
    await processDocument(row.id);
  }

  return { reprocessed: stalled.rows.length };
}
