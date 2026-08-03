import { getDriveClient, getSchoolGoogleCredentials } from "@/lib/google";
import { db } from "@/lib/db";
import {
  schools,
  schoolDriveIntegrations,
  driveFileIndex,
} from "@/lib/db/schema";
import { eq, and, inArray, isNull, notInArray, sql } from "drizzle-orm";
import {
  assertFolderReachable,
  getFileContent,
  listFolderChildren,
} from "@/lib/drive";
import { generateEmbeddings } from "@/lib/ai/embeddings";
import { formatDriveFileForEmbedding } from "@/lib/ai/embedding-formatters";

const MAX_CONTENT_LENGTH = 10000; // 10KB per file

// One OpenAI request per chunk of files. Small enough that a slow response
// can't blow the cron's time budget, large enough to avoid a call per file.
const EMBEDDING_BATCH_SIZE = 20;

interface IndexedFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  parentFolderId: string;
  textContent: string | null;
  integrationId: string;
  integrationName: string;
}

/**
 * Recursively list all files in a folder and its subfolders.
 */
async function listFilesRecursively(
  drive: ReturnType<typeof getDriveClient>,
  folderId: string,
  integrationId: string,
  integrationName: string,
  depth = 0,
  maxDepth = 5
): Promise<
  Array<{
    id: string;
    name: string;
    mimeType: string;
    parentFolderId: string;
    integrationId: string;
    integrationName: string;
  }>
> {
  if (depth > maxDepth) return [];

  const allFiles: Array<{
    id: string;
    name: string;
    mimeType: string;
    parentFolderId: string;
    integrationId: string;
    integrationName: string;
  }> = [];

  for (const child of await listFolderChildren(drive, folderId)) {
    if (child.isFolder) {
      // Recursively get files from subfolders
      allFiles.push(
        ...(await listFilesRecursively(
          drive,
          child.id,
          integrationId,
          integrationName,
          depth + 1,
          maxDepth
        ))
      );
    } else {
      allFiles.push({
        id: child.id,
        name: child.name,
        mimeType: child.mimeType,
        parentFolderId: folderId,
        integrationId,
        integrationName,
      });
    }
  }

  return allFiles;
}

/**
 * Index all Drive files for a single school.
 * Fetches all files from configured folders, extracts text, and upserts to DB.
 */
export async function indexSchoolDriveFiles(schoolId: string): Promise<{
  indexed: number;
  errors: number;
  deleted: number;
  embedded: number;
}> {
  const credentials = await getSchoolGoogleCredentials(schoolId);
  if (!credentials) {
    return { indexed: 0, errors: 0, deleted: 0, embedded: 0 };
  }

  const drive = getDriveClient(credentials);

  // Get all active folder integrations
  const folders = await db.query.schoolDriveIntegrations.findMany({
    where: and(
      eq(schoolDriveIntegrations.schoolId, schoolId),
      eq(schoolDriveIntegrations.active, true)
    ),
  });

  if (folders.length === 0) {
    return { indexed: 0, errors: 0, deleted: 0, embedded: 0 };
  }

  const indexedFiles: IndexedFile[] = [];
  let errors = 0;
  // Only folders we actually managed to read are safe to prune against below.
  const listedIntegrationIds: string[] = [];

  // Collect all files from all folders
  for (const folder of folders) {
    try {
      const folderMaxDepth = folder.maxDepth ?? 5;
      const integrationName = folder.name || "";

      // A folder that was never shared with the service account lists as empty
      // with a 200 — without this the run reports success and indexes nothing.
      await assertFolderReachable(
        drive,
        folder.folderId,
        folder.name ?? undefined
      );

      const files = await listFilesRecursively(
        drive,
        folder.folderId,
        folder.id,
        integrationName,
        0,
        folderMaxDepth
      );

      listedIntegrationIds.push(folder.id);

      for (const file of files) {
        try {
          // Try to extract text content
          let textContent: string | null = null;

          // Only extract text from supported file types
          const supportedTypes = [
            "application/vnd.google-apps.document",
            "application/vnd.google-apps.spreadsheet",
            "application/vnd.google-apps.presentation",
            "text/plain",
            "text/markdown",
            "text/csv",
          ];

          if (
            supportedTypes.includes(file.mimeType) ||
            file.mimeType.startsWith("text/")
          ) {
            try {
              const content = await getFileContent(
                schoolId,
                file.id,
                file.mimeType
              );
              textContent =
                content.length > MAX_CONTENT_LENGTH
                  ? content.slice(0, MAX_CONTENT_LENGTH)
                  : content;
            } catch {
              // Failed to extract content, continue without it
            }
          }

          indexedFiles.push({
            fileId: file.id,
            fileName: file.name,
            mimeType: file.mimeType,
            parentFolderId: file.parentFolderId,
            textContent,
            integrationId: file.integrationId,
            integrationName: file.integrationName,
          });
        } catch {
          errors++;
        }
      }
    } catch (error) {
      console.error(`Failed to list files from folder ${folder.folderId}:`, error);
      errors++;
    }
  }

  // Upsert all indexed files using raw SQL for proper tsvector handling
  for (const file of indexedFiles) {
    try {
      await db.execute(sql`
        INSERT INTO drive_file_index (
          school_id,
          file_id,
          file_name,
          mime_type,
          parent_folder_id,
          text_content,
          integration_id,
          integration_name,
          source,
          search_vector,
          last_indexed_at
        ) VALUES (
          ${schoolId},
          ${file.fileId},
          ${file.fileName},
          ${file.mimeType},
          ${file.parentFolderId},
          ${file.textContent},
          ${file.integrationId},
          ${file.integrationName},
          'google_drive',
          setweight(to_tsvector('english', ${file.fileName}), 'A') ||
            setweight(to_tsvector('english', coalesce(${file.integrationName}, '')), 'B') ||
            setweight(to_tsvector('english', coalesce(${file.textContent}, '')), 'C'),
          NOW()
        )
        ON CONFLICT (school_id, file_id) DO UPDATE SET
          file_name = EXCLUDED.file_name,
          mime_type = EXCLUDED.mime_type,
          parent_folder_id = EXCLUDED.parent_folder_id,
          text_content = EXCLUDED.text_content,
          integration_id = EXCLUDED.integration_id,
          integration_name = EXCLUDED.integration_name,
          search_vector = EXCLUDED.search_vector,
          -- An embedding describes the text it was built from, so leaving it
          -- in place after an edit makes Ask DragonHub answer from a version
          -- of the document that no longer exists. Dropping it here is what
          -- queues the file for re-embedding below.
          embedding = CASE
            WHEN drive_file_index.text_content IS DISTINCT FROM EXCLUDED.text_content
              OR drive_file_index.file_name IS DISTINCT FROM EXCLUDED.file_name
              OR drive_file_index.integration_name IS DISTINCT FROM EXCLUDED.integration_name
            THEN NULL
            ELSE drive_file_index.embedding
          END,
          last_indexed_at = NOW()
      `);
    } catch (error) {
      console.error(`Failed to index file ${file.fileName}:`, error);
      errors++;
    }
  }

  // Delete files that no longer exist in Drive.
  //
  // Scoped to source = "google_drive": uploaded documents and one-off Drive
  // links live in this same table but are not represented in the folder
  // listing, so without this filter every sync run would wipe them.
  //
  // Scoped again to the folders that listed successfully: "absent from the
  // listing" only means "deleted in Drive" for a folder we could actually
  // read. A folder that has lost its sharing lists as nothing, and pruning
  // against that would delete its whole index — along with the embeddings that
  // cost money to rebuild — over what is usually a permissions slip someone
  // fixes in a minute.
  let deleted = 0;
  const allFoldersListed = listedIntegrationIds.length === folders.length;
  if (indexedFiles.length > 0 && listedIntegrationIds.length > 0) {
    const existingFileIds = indexedFiles.map((f) => f.fileId);
    const deletedResult = await db
      .delete(driveFileIndex)
      .where(
        and(
          eq(driveFileIndex.schoolId, schoolId),
          eq(driveFileIndex.source, "google_drive"),
          notInArray(driveFileIndex.fileId, existingFileIds),
          // When every folder listed, prune school-wide so rows left behind by
          // a since-deleted integration are cleaned up too.
          allFoldersListed
            ? undefined
            : inArray(driveFileIndex.integrationId, listedIntegrationIds)
        )
      )
      .returning();
    deleted = deletedResult.length;
  }

  // Indexing a file only makes it findable by keyword. Ask DragonHub searches
  // by embedding and skips any row without one, so a file that stops here is
  // invisible to it — which is how a whole Drive folder can look indexed while
  // the assistant insists it has never seen those documents.
  const embedded = await embedPendingDriveFiles(schoolId);

  return {
    indexed: indexedFiles.length,
    errors,
    deleted,
    embedded,
  };
}

/**
 * Generate embeddings for this school's Drive files that are missing one.
 *
 * Covers both halves of the problem: files indexed before embeddings were
 * generated at sync time, and files whose embedding the upsert just cleared
 * because their contents changed.
 */
export async function embedPendingDriveFiles(
  schoolId: string
): Promise<number> {
  const pending = await db.query.driveFileIndex.findMany({
    where: and(
      eq(driveFileIndex.schoolId, schoolId),
      isNull(driveFileIndex.embedding)
    ),
    columns: {
      id: true,
      fileName: true,
      title: true,
      mimeType: true,
      textContent: true,
      integrationName: true,
    },
  });

  let embedded = 0;

  for (let i = 0; i < pending.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = pending.slice(i, i + EMBEDDING_BATCH_SIZE);
    try {
      const vectors = await generateEmbeddings(
        batch.map((file) =>
          formatDriveFileForEmbedding({
            fileName: file.title || file.fileName,
            textContent: file.textContent,
            integrationName: file.integrationName,
            mimeType: file.mimeType,
          })
        )
      );

      for (const [index, file] of batch.entries()) {
        await db
          .update(driveFileIndex)
          .set({ embedding: vectors[index] })
          .where(eq(driveFileIndex.id, file.id));
        embedded++;
      }
    } catch (error) {
      // A failed batch stays unembedded and is retried on the next sync
      // rather than failing the whole indexing run.
      console.error(`Failed to embed Drive file batch for ${schoolId}:`, error);
    }
  }

  return embedded;
}

/**
 * Index Drive files for all schools.
 */
export async function indexAllSchoolsDriveFiles(): Promise<{
  schools: number;
  totalIndexed: number;
  totalErrors: number;
  totalDeleted: number;
  totalEmbedded: number;
}> {
  const allSchools = await db.query.schools.findMany({
    where: eq(schools.active, true),
    columns: { id: true },
  });

  let totalIndexed = 0;
  let totalErrors = 0;
  let totalDeleted = 0;
  let totalEmbedded = 0;

  for (const school of allSchools) {
    try {
      const result = await indexSchoolDriveFiles(school.id);
      totalIndexed += result.indexed;
      totalErrors += result.errors;
      totalDeleted += result.deleted;
      totalEmbedded += result.embedded;
    } catch (error) {
      console.error(`Failed to index school ${school.id}:`, error);
      totalErrors++;
    }
  }

  return {
    schools: allSchools.length,
    totalIndexed,
    totalErrors,
    totalDeleted,
    totalEmbedded,
  };
}
