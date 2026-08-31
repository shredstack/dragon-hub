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
import { isAgendaFile } from "@/lib/sync/minutes-sync";
import { touchSyncStatus } from "@/lib/sync-status";

const MAX_CONTENT_LENGTH = 10000; // 10KB per file

// One OpenAI request per chunk of files. Small enough that a slow response
// can't blow the cron's time budget, large enough to avoid a call per file.
const EMBEDDING_BATCH_SIZE = 20;

// Rows per upsert statement. Each row binds ~14 parameters (several columns
// appear again inside the tsvector expression), well inside Postgres' cap.
const UPSERT_CHUNK_SIZE = 100;

interface IndexedFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  parentFolderId: string;
  textContent: string | null;
  integrationId: string;
  integrationName: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Upsert a batch of files into `drive_file_index` in a single statement.
 *
 * Raw SQL because the `search_vector` tsvector has to be built server-side, and
 * because the embedding-invalidation rule below is a CASE over the pre-update
 * row — neither is expressible through the query builder.
 */
async function upsertDriveFiles(
  schoolId: string,
  files: IndexedFile[]
): Promise<void> {
  if (files.length === 0) return;

  const rows = files.map(
    (file) => sql`(
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
    )`
  );

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
    ) VALUES ${sql.join(rows, sql`, `)}
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
  // Real minutes documents belong to minutes-sync.ts's pta_minutes table, not
  // here — see the exclusion below. Tracked by file id rather than skipped
  // inline, because a "general" integration's own recursive walk can
  // independently rediscover the same physical file if it happens to contain
  // the minutes folder as a subfolder; excluding only during the minutes
  // folder's own pass would miss that second, unrelated discovery of it.
  const minutesOwnedFileIds = new Set<string>();

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
          // A "minutes"-type folder's actual minutes documents are fully
          // owned by minutes-sync.ts, into the dedicated pta_minutes table —
          // with the full text, structured meeting-date metadata, and its own
          // embedding, none of which this generic path has. Indexing the same
          // document here too used to double it: Ask DragonHub would cite
          // "Drive: 01/08/2025 Minutes" and "Minutes: 2025-01-08" side by
          // side as if they were two different sources. Agendas have no
          // sync of their own, so they still come through here.
          if (folder.folderType === "minutes" && !isAgendaFile(file.name)) {
            minutesOwnedFileIds.add(file.id);
            continue;
          }

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

  // A file pushed above via some *other* folder's own recursive walk (e.g. a
  // "general" integration that happens to contain the minutes folder as a
  // subfolder) still needs to be caught here — the inline skip above only
  // fires while walking a "minutes"-type folder itself.
  const filesToIndex = indexedFiles.filter(
    (f) => !minutesOwnedFileIds.has(f.fileId)
  );

  // A file reachable through two different folder walks (a "general"
  // integration containing another integration's folder as a subfolder) is in
  // this list twice. Per-row upserts tolerated that — the second simply
  // overwrote the first — but one statement cannot touch the same conflict
  // target twice, so collapse to the last occurrence, which is the row the
  // old loop would have left behind.
  const dedupedFiles = [
    ...new Map(filesToIndex.map((f) => [f.fileId, f] as const)).values(),
  ];

  // Upsert all indexed files using raw SQL for proper tsvector handling.
  // Batched: this table holds every Drive document the school has, and one
  // round trip per file each night was the bulk of what kept the Neon endpoint
  // awake for this job.
  for (const batch of chunk(dedupedFiles, UPSERT_CHUNK_SIZE)) {
    try {
      await upsertDriveFiles(schoolId, batch);
    } catch (error) {
      // One malformed row would otherwise cost the whole batch, so fall back to
      // the per-row path and let the failures name themselves.
      console.error(
        `Failed to index a batch of ${batch.length} files, retrying individually:`,
        error
      );
      for (const file of batch) {
        try {
          await upsertDriveFiles(schoolId, [file]);
        } catch (fileError) {
          console.error(`Failed to index file ${file.fileName}:`, fileError);
          errors++;
        }
      }
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
  if (listedIntegrationIds.length > 0) {
    // Deliberately built from filesToIndex, not indexedFiles: a minutes-owned
    // file is absent from this list on purpose, so this prune step is also
    // what removes it from drive_file_index if an older sync left it there.
    // filesToIndex can legitimately be empty (e.g. a minutes-only integration
    // with no agenda files) — notInArray() on an empty array evaluates to
    // `true`, so the delete still runs and prunes everything stale for the
    // listed integrations rather than being skipped.
    const existingFileIds = filesToIndex.map((f) => f.fileId);
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

  await touchSyncStatus(schoolId, "driveLastIndexedAt", new Date());

  return {
    indexed: filesToIndex.length,
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
